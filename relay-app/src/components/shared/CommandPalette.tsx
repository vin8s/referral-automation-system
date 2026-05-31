'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/shared/Icon';
import { StatePill } from '@/components/shared/StatePill';
import { getReferrals } from '@/lib/data';
import type { Referral } from '@/lib/types';

// ── Quick nav links ────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'Dashboard',         icon: 'home',     href: '/dashboard'  },
  { label: 'Confirm queue',     icon: 'check',    href: '/action'     },
  { label: 'Referrals',         icon: 'list',     href: '/referrals'  },
  { label: 'Alerts',            icon: 'alert',    href: '/alerts'     },
  { label: 'Referral log',      icon: 'transcript',href: '/calls'     },
  { label: 'Calendar',          icon: 'cal',      href: '/calendar'   },
  { label: 'Ingest referrals',  icon: 'upload',   href: '/ingest'     },
  { label: 'Analytics',         icon: 'chart',    href: '/analytics'  },
  { label: 'Settings',          icon: 'cog',      href: '/settings'   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--relay-accent-100)', color: 'var(--relay-accent-700)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Command palette ───────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetchedRef = useRef(false);

  // Load referrals once
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      getReferrals().then(setReferrals);
    }
  }, []);

  // Focus input and reset when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const trimmed = query.trim();

  const matchedPatients = trimmed.length === 0 ? [] : referrals
    .filter(r =>
      r.patient.name.toLowerCase().includes(trimmed.toLowerCase()) ||
      r.id.toLowerCase().includes(trimmed.toLowerCase())
    )
    .slice(0, 6);

  const matchedNav = NAV_LINKS.filter(n =>
    trimmed.length === 0 || n.label.toLowerCase().includes(trimmed.toLowerCase())
  );

  // Flat list of all selectable items for keyboard nav
  type Item =
    | { kind: 'patient'; referral: Referral }
    | { kind: 'nav'; link: typeof NAV_LINKS[number] };

  const items: Item[] = [
    ...matchedPatients.map(r => ({ kind: 'patient' as const, referral: r })),
    ...matchedNav.map(n => ({ kind: 'nav' as const, link: n })),
  ];

  function commit(item: Item) {
    onClose();
    if (item.kind === 'patient') router.push(`/referrals/${item.referral.id}`);
    else router.push(item.link.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && items[activeIdx]) commit(items[activeIdx]);
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(15, 23, 32, 0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '100%', maxWidth: 580,
          background: 'var(--relay-surface)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.06)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          borderBottom: items.length > 0 ? '1px solid var(--relay-hairline)' : 'none',
        }}>
          <Icon name="search" size={18} style={{ color: 'var(--relay-ink-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            placeholder="Search patients, referral IDs, or jump to a page…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 16, color: 'var(--relay-ink)', fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setActiveIdx(0); inputRef.current?.focus(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--relay-ink-4)', display: 'flex', padding: 2 }}
            >
              <Icon name="x" size={14} />
            </button>
          )}
          <kbd style={{
            fontSize: 11, color: 'var(--relay-ink-4)', background: 'var(--relay-tint)',
            border: '1px solid var(--relay-hairline)', borderRadius: 5, padding: '2px 6px',
            fontFamily: 'inherit', flexShrink: 0,
          }}>
            esc
          </kbd>
        </div>

        {/* Results */}
        {items.length > 0 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {/* Patient matches */}
            {matchedPatients.length > 0 && (
              <>
                <div style={{ padding: '8px 18px 4px', fontSize: 11, fontWeight: 600, color: 'var(--relay-ink-4)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Patients
                </div>
                {matchedPatients.map((r, i) => {
                  const idx = i;
                  const active = activeIdx === idx;
                  return (
                    <div
                      key={r.id}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onMouseDown={e => { e.preventDefault(); commit({ kind: 'patient', referral: r }); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 18px', cursor: 'pointer',
                        background: active ? 'var(--relay-accent)' : 'transparent',
                        transition: 'background 0.08s',
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: active ? 'rgba(255,255,255,0.2)' : 'var(--relay-accent-100)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 600,
                        color: active ? '#fff' : 'var(--relay-accent-700)',
                      }}>
                        {r.patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: active ? '#fff' : 'var(--relay-ink)', lineHeight: 1.3 }}>
                          <Highlight text={r.patient.name} query={trimmed} />
                        </div>
                        <div style={{ fontSize: 12, color: active ? 'rgba(255,255,255,0.75)' : 'var(--relay-ink-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Highlight text={r.id} query={trimmed} /> · <Highlight text={r.reason} query={trimmed} /> · {r.referringProvider}
                        </div>
                      </div>
                      <StatePill state={r.state} />
                      <Icon name="arrow" size={13} style={{ color: active ? 'rgba(255,255,255,0.6)' : 'var(--relay-ink-4)', flexShrink: 0 }} />
                    </div>
                  );
                })}
              </>
            )}

            {/* Nav links */}
            {matchedNav.length > 0 && (
              <>
                <div style={{ padding: '8px 18px 4px', fontSize: 11, fontWeight: 600, color: 'var(--relay-ink-4)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {trimmed ? 'Pages' : 'Jump to'}
                </div>
                {matchedNav.map((n, i) => {
                  const idx = matchedPatients.length + i;
                  const active = activeIdx === idx;
                  return (
                    <div
                      key={n.href}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onMouseDown={e => { e.preventDefault(); commit({ kind: 'nav', link: n }); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '9px 18px', cursor: 'pointer',
                        background: active ? 'var(--relay-accent)' : 'transparent',
                        transition: 'background 0.08s',
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                        background: active ? 'rgba(255,255,255,0.2)' : 'var(--relay-tint)',
                        border: `1px solid ${active ? 'rgba(255,255,255,0.15)' : 'var(--relay-hairline)'}`,
                        display: 'grid', placeItems: 'center',
                        color: active ? '#fff' : 'var(--relay-ink-2)',
                      }}>
                        <Icon name={n.icon} size={13} />
                      </div>
                      <span style={{ fontSize: 13.5, color: active ? '#fff' : 'var(--relay-ink)', fontWeight: active ? 500 : 400, flex: 1 }}>
                        <Highlight text={n.label} query={trimmed} />
                      </span>
                      <Icon name="arrow" size={13} style={{ color: active ? 'rgba(255,255,255,0.6)' : 'var(--relay-ink-4)', flexShrink: 0 }} />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Empty state when query typed but nothing matches */}
        {trimmed && items.length === 0 && (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--relay-ink-3)', fontSize: 13 }}>
            No patients or pages matching &ldquo;{trimmed}&rdquo;
          </div>
        )}

        {/* Footer hints */}
        <div style={{
          display: 'flex', gap: 16, padding: '8px 18px',
          borderTop: '1px solid var(--relay-hairline)',
          fontSize: 11, color: 'var(--relay-ink-4)',
        }}>
          <span><kbd style={{ fontFamily: 'inherit', background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)', borderRadius: 4, padding: '1px 5px' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily: 'inherit', background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)', borderRadius: 4, padding: '1px 5px' }}>↵</kbd> open</span>
          <span><kbd style={{ fontFamily: 'inherit', background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)', borderRadius: 4, padding: '1px 5px' }}>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
