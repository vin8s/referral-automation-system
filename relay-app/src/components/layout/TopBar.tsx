'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/shared/Icon';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { useSession } from '@/contexts/SessionContext';
import { getReferrals } from '@/lib/data';
import { ROLE_LABEL } from '@/lib/auth-types';
import type { Referral } from '@/lib/types';

// ── TopBar search ─────────────────────────────────────────────────────────────

function TopBarSearch({ onOpenPalette }: { onOpenPalette: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (pathname === '/referrals') {
      setQuery(searchParams.get('q') ?? '');
    } else {
      setQuery('');
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);


  function fetchOnce() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    getReferrals().then(setReferrals);
  }

  const trimmed = query.trim().toLowerCase();
  const suggestions = trimmed.length < 1 ? [] : referrals
    .filter(r => r.patient.name.toLowerCase().includes(trimmed))
    .slice(0, 6);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setActiveIdx(-1);
    setOpen(true);
  }

  function handleFocus() {
    fetchOnce();
    if (query.trim()) setOpen(true);
  }

  function commit(r: Referral) {
    setOpen(false);
    setActiveIdx(-1);
    setQuery(r.patient.name);
    router.push(`/referrals/${r.id}`);
  }

  function runSearch() {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/referrals?q=${encodeURIComponent(query.trim())}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && suggestions[activeIdx]) commit(suggestions[activeIdx]);
      else runSearch();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
      if (!query) {
        inputRef.current?.blur();
      } else {
        setQuery('');
        if (pathname === '/referrals') router.push('/referrals');
      }
    }
  }

  function highlight(text: string) {
    if (!trimmed) return text;
    const idx = text.toLowerCase().indexOf(trimmed);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <strong style={{ color: 'var(--relay-ink)' }}>{text.slice(idx, idx + trimmed.length)}</strong>
        {text.slice(idx + trimmed.length)}
      </>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: '0 1 280px' }}>
      <div className="tb-search" style={{ cursor: 'pointer' }} onClick={onOpenPalette}>
        <Icon name="search" size={14} />
        <span style={{ flex: 1, fontSize: 13, color: 'var(--relay-ink-3)', userSelect: 'none' }}>
          Search patients, pages…
        </span>
        <span className="tb-kbd">⌘K</span>
      </div>

    </div>
  );
}

// ── User menu (signed-in staff member + sign out) ─────────────────────────────

function UserMenu() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = user.name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="tb-avatar"
        title={user.name}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 700, width: 240,
            background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
            borderRadius: 'var(--relay-radius)', boxShadow: 'var(--relay-shadow-pop)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--relay-hairline)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--relay-ink)' }}>{user.name}</div>
            {user.email && (
              <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </div>
            )}
            <span style={{
              display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: 'var(--relay-accent-50)', color: 'var(--relay-accent-800)', border: '1px solid var(--relay-accent-200)',
            }}>
              {ROLE_LABEL[user.role]}
            </span>
          </div>
          <form action="/api/auth/logout" method="post" style={{ padding: 6 }}>
            <button type="submit" role="menuitem" className="nav-item">
              <Icon name="logout" size={14} /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBarInner() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="tb">
      {paletteOpen && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
      <Suspense fallback={
        <div className="tb-search" style={{ flex: '0 1 280px' }}>
          <Icon name="search" size={14} />
          <input placeholder="Search patients by name…" aria-label="Search" />
          <span className="tb-kbd">⌘K</span>
        </div>
      }>
        <TopBarSearch onOpenPalette={() => setPaletteOpen(true)} />
      </Suspense>

      <div className="tb-right">
        <UserMenu />
      </div>
    </div>
  );
}

export function TopBar() {
  return (
    <Suspense fallback={
      <div className="tb">
        <div className="tb-search" style={{ flex: '0 1 280px' }}>
          <Icon name="search" size={14} />
          <input placeholder="Search patients by name…" aria-label="Search" />
          <span className="tb-kbd">⌘K</span>
        </div>
      </div>
    }>
      <TopBarInner />
    </Suspense>
  );
}
