'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/shared/Icon';
import { StatePill } from '@/components/shared/StatePill';
import { getReferrals } from '@/lib/data';
import type { Referral } from '@/lib/types';

function TopBarSearch() {
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

  // Keep input in sync with URL
  useEffect(() => {
    if (pathname === '/referrals') {
      setQuery(searchParams.get('q') ?? '');
    } else {
      setQuery('');
    }
  }, [pathname, searchParams]);

  // Close on outside click
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

  // ⌘K focuses the search input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        fetchOnce();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const v = e.target.value;
    setQuery(v);
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
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        commit(suggestions[activeIdx]);
      } else {
        runSearch();
      }
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

  const showDropdown = open && suggestions.length > 0;

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
      <div className="tb-search">
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search patients by name…"
          aria-label="Search"
          autoComplete="off"
        />
        {query ? (
          <button
            onMouseDown={e => { e.preventDefault(); setQuery(''); setOpen(false); if (pathname === '/referrals') router.push('/referrals'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--relay-ink-3)' }}
            aria-label="Clear search"
          >
            <Icon name="x" size={12} />
          </button>
        ) : (
          <span className="tb-kbd">⌘K</span>
        )}
      </div>

      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          background: 'var(--relay-surface)',
          border: '1px solid var(--relay-hairline)',
          borderRadius: 10,
          boxShadow: 'var(--relay-shadow-pop)',
          overflow: 'hidden',
          zIndex: 600,
          minWidth: 300,
        }}>
          {suggestions.map((r, i) => (
            <div
              key={r.id}
              onMouseDown={e => { e.preventDefault(); commit(r); }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                cursor: 'pointer',
                background: i === activeIdx ? 'var(--relay-tint)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--relay-hairline)' : 'none',
              }}
            >
              <div
                style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--relay-accent-100)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'var(--relay-accent-700)',
                }}
              >
                {r.patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--relay-ink-2)', fontWeight: 500, lineHeight: 1.3 }}>
                  {highlight(r.patient.name)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', lineHeight: 1.3, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {highlight(r.reason)} · {r.referringProvider}
                </div>
              </div>
              <StatePill state={r.state} />
            </div>
          ))}

          {trimmed.length > 0 && (
            <div
              onMouseDown={e => { e.preventDefault(); runSearch(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                cursor: 'pointer',
                fontSize: 12.5,
                color: 'var(--relay-accent)',
                background: activeIdx === suggestions.length ? 'var(--relay-tint)' : 'var(--relay-accent-50)',
                fontWeight: 500,
              }}
              onMouseEnter={() => setActiveIdx(suggestions.length)}
            >
              <Icon name="search" size={12} />
              Search all patients named &ldquo;{query.trim()}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  return (
    <div className="tb">
      <Suspense fallback={
        <div className="tb-search" style={{ flex: '0 1 280px' }}>
          <Icon name="search" size={14} />
          <input placeholder="Search patients by name…" aria-label="Search" />
          <span className="tb-kbd">⌘K</span>
        </div>
      }>
        <TopBarSearch />
      </Suspense>
      <div className="tb-right">
        <button className="tb-pill">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--relay-accent)', flexShrink: 0 }} />
          Production · Mission Bay
          <Icon name="chevron" size={11} />
        </button>
        <button className="tb-iconbtn" aria-label="Notifications">
          <Icon name="bell" size={15} />
          <span className="tb-bell-dot" />
        </button>
        <button className="tb-avatar" title="Priya N. — Medical assistant" aria-label="Account">
          P
        </button>
      </div>
    </div>
  );
}
