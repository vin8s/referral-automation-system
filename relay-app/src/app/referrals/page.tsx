'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { utils as xlsxUtils, writeFileXLSX } from 'xlsx';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatePill } from '@/components/shared/StatePill';
import { getReferrals } from '@/lib/data';
import { StatePicker } from '@/components/shared/StatePicker';
import { useCallQueue } from '@/contexts/CallQueueContext';
import type { Referral, ReferralState } from '@/lib/types';

function exportReferrals(rows: Referral[], label: string) {
  const data = rows.map(r => ({
    'Referral ID':         r.id,
    'Patient Name':        r.patient.name,
    'Date of Birth':       r.patient.dateOfBirth,
    'Phone':               r.patient.phone,
    'Sex':                 r.patient.sex,
    'Age':                 r.patient.age,
    'Language':            r.patient.language,
    'Insurance':           r.patient.insurance,
    'Reason':              r.reason,
    'Referring Provider':  r.referringProvider,
    'Priority':            r.priority,
    'State':               r.state,
    'Referral Time':       r.referralTime,
    'Location':            r.location,
    'Attempts':            r.attempts.length,
    'Last Summary':        r.attempts[r.attempts.length - 1]?.summary ?? '',
  }));
  const ws = xlsxUtils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] ?? {}).map((k) =>
    ({ wch: Math.max(k.length, ...data.map(row => String((row as Record<string,unknown>)[k] ?? '').length)) + 2 })
  );
  const wb = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(wb, ws, 'Referrals');
  const date = new Date().toISOString().slice(0, 10);
  writeFileXLSX(wb, `relay-referrals-${label}-${date}.xlsx`);
}

const STATE_FILTERS: { value: string; label: string; dot?: string }[] = [
  { value: 'all',                  label: 'All' },
  { value: 'Queued',               label: 'Queued',               dot: '#3b82f6' },
  { value: 'In Progress',          label: 'In Progress',          dot: '#0891b2' },
  { value: 'Attempted',            label: 'Attempted',            dot: 'var(--st-attempted-fg)' },
  { value: 'Pending Confirmation', label: 'Pending Confirmation', dot: '#6d28d9' },
  { value: 'Escalated',            label: 'Escalated',            dot: '#dc2626' },
];

// ── Shared referral table ─────────────────────────────────────────────────────
function ReferralTable({
  rows,
  showStatePicker = false,
  onStateChange,
  sort,
  onSort,
}: {
  rows: Referral[];
  showStatePicker?: boolean;
  onStateChange?: (id: string, next: ReferralState) => void;
  sort: { col: string; dir: 'asc' | 'desc' };
  onSort: (col: string) => void;
}) {
  const router = useRouter();

  function SortableTh({ col, children }: { col: string; children: React.ReactNode }) {
    const on = sort.col === col;
    return (
      <th
        className={`sortable${on ? ' sort-on' : ''}${on && sort.dir === 'asc' ? ' sort-asc' : ''}`}
        onClick={() => onSort(col)}
      >
        {children}
        <span className="sort-ind"><Icon name="chevron" size={10} /></span>
      </th>
    );
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <SortableTh col="patient">Patient</SortableTh>
          <th>Referring provider</th>
          <SortableTh col="id">Referred</SortableTh>
          <SortableTh col="state">State</SortableTh>
          <th>Language</th>
          <th>Insurance</th>
          <th>Last summary</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const lastAttempt = r.attempts[r.attempts.length - 1];
          return (
            <tr
              key={r.id}
              className={r.priority === 'urgent' ? 'pri-urgent' : ''}
              onClick={() => router.push(`/referrals/${r.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <td>
                <div style={{ fontWeight: 500 }}>{r.patient.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{r.patient.age}{r.patient.sex} · {r.id}</div>
              </td>
              <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{r.referringProvider}</td>
              <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', fontVariantNumeric: 'tabular-nums' }}>{r.referralTime}</td>
              <td style={{ overflow: 'visible' }} onClick={e => e.stopPropagation()}>
                {showStatePicker && onStateChange ? (
                  <StatePicker referralId={r.id} current={r.state} onChange={onStateChange} />
                ) : (
                  <StatePill state={r.state} />
                )}
              </td>
              <td style={{ color: 'var(--relay-ink-2)' }}>{r.patient.language}</td>
              <td style={{ color: 'var(--relay-ink-2)' }}>{r.patient.insurance}</td>
              <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
                {lastAttempt?.summary ?? '—'}
              </td>
              <td>
                <span className="btn btn-sm btn-ghost" style={{ pointerEvents: 'none' }}>
                  <Icon name="arrow" size={12} />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Referrals page ────────────────────────────────────────────────────────────
export default function ReferralsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openQueue } = useCallQueue();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'id', dir: 'desc' });
  const [bookedOpen, setBookedOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync search state when URL param changes (e.g. TopBar navigation)
  useEffect(() => {
    setSearch(searchParams.get('q') ?? '');
  }, [searchParams]);

  useEffect(() => { getReferrals().then(setReferrals); }, []);

  // Close suggestion dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleStateChange(referralId: string, next: ReferralState) {
    setReferrals(prev =>
      prev.map(r => r.id === referralId ? { ...r, state: next } : r)
    );
  }

  // Active referrals exclude Booked — those are "done"
  const active = useMemo(() => referrals.filter(r => r.state !== 'Booked'), [referrals]);
  const booked = useMemo(() => referrals.filter(r => r.state === 'Booked'), [referrals]);

  function applySort(rows: Referral[]) {
    return [...rows].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (sort.col === 'id')      return a.id > b.id ? dir : -dir;
      if (sort.col === 'state')   return a.state > b.state ? dir : -dir;
      if (sort.col === 'patient') return a.patient.name > b.patient.name ? dir : -dir;
      return 0;
    });
  }

  const filtered = useMemo(() => {
    let rows = active;
    if (stateFilter !== 'all') rows = rows.filter(r => r.state === stateFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.patient.name.toLowerCase().includes(q) ||
        r.referringProvider.toLowerCase().includes(q)
      );
    }
    return applySort(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stateFilter, search, sort]);

  function onSort(col: string) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  const trimmed = search.trim().toLowerCase();

  // Build suggestion list: patient name matches first, then doctor matches
  const suggestions = useMemo(() => {
    if (trimmed.length < 1) return [];
    const seen = new Set<string>();
    const results: { label: string; sub: string; referralId?: string; doctorName?: string }[] = [];

    // Patient matches → navigate to referral detail
    referrals.filter(r => r.patient.name.toLowerCase().includes(trimmed)).slice(0, 4).forEach(r => {
      results.push({ label: r.patient.name, sub: `${r.reason} · ${r.state}`, referralId: r.id });
    });

    // Doctor matches → filter table by provider
    const doctorHits = referrals.filter(r => r.referringProvider.toLowerCase().includes(trimmed));
    const doctors = [...new Set(doctorHits.map(r => r.referringProvider))].slice(0, 3);
    doctors.forEach(doc => {
      if (!seen.has(doc)) {
        seen.add(doc);
        const count = doctorHits.filter(r => r.referringProvider === doc).length;
        results.push({ label: doc, sub: `${count} referral${count !== 1 ? 's' : ''}`, doctorName: doc });
      }
    });

    return results.slice(0, 6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, referrals]);

  function commitSuggestion(s: typeof suggestions[0]) {
    setSuggestOpen(false);
    setActiveIdx(-1);
    if (s.referralId) {
      router.push(`/referrals/${s.referralId}`);
    } else if (s.doctorName) {
      setSearch(s.doctorName);
      const params = new URLSearchParams(searchParams.toString());
      params.set('q', s.doctorName);
      router.replace(`/referrals?${params.toString()}`, { scroll: false });
    }
  }

  function highlight(text: string) {
    if (!trimmed) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(trimmed);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <strong style={{ color: 'var(--relay-ink)' }}>{text.slice(idx, idx + trimmed.length)}</strong>
        {text.slice(idx + trimmed.length)}
      </>
    );
  }

  return (
    <>
      <PageHead title="Referrals" sub={`${filtered.length} of ${active.length} active referrals`}>
        <button className="btn btn-sm btn-primary" onClick={openQueue}>
          <Icon name="phone" size={12} /> Run Queue
        </button>
        <button
          className="btn btn-sm"
          onClick={() => exportReferrals(filtered, stateFilter === 'all' ? 'all' : stateFilter.toLowerCase().replace(/ /g, '-'))}
          disabled={filtered.length === 0}
          title={`Export ${filtered.length} visible referral${filtered.length !== 1 ? 's' : ''} to Excel`}
        >
          <Icon name="download" size={12} /> Export{filtered.length > 0 ? ` (${filtered.length})` : ''}
        </button>
        <Link href="/ingest">
          <button className="btn btn-sm btn-primary"><Icon name="upload" size={12} /> Ingest</button>
        </Link>
      </PageHead>

      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 12, padding: '10px 14px',
        background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
        borderRadius: 'var(--relay-radius) var(--relay-radius) 0 0',
      }}>
        {/* Search with autocomplete */}
        <div ref={searchContainerRef} style={{ position: 'relative', flex: '0 1 260px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 9px', background: 'var(--relay-tint)',
            border: '1px solid var(--relay-hairline)', borderRadius: 7,
          }}>
            <Icon name="search" size={13} />
            <input
              ref={searchInputRef}
              value={search}
              onChange={e => {
                const v = e.target.value;
                setSearch(v);
                setActiveIdx(-1);
                setSuggestOpen(true);
                const params = new URLSearchParams(searchParams.toString());
                if (v) params.set('q', v); else params.delete('q');
                router.replace(`/referrals?${params.toString()}`, { scroll: false });
              }}
              onFocus={() => { if (search.trim()) setSuggestOpen(true); }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); setSuggestOpen(true); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
                else if (e.key === 'Enter') { if (activeIdx >= 0 && suggestions[activeIdx]) commitSuggestion(suggestions[activeIdx]); else setSuggestOpen(false); }
                else if (e.key === 'Escape') { setSuggestOpen(false); setActiveIdx(-1); }
              }}
              placeholder="Search patient or doctor…"
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 13, color: 'var(--relay-ink)', fontFamily: 'inherit' }}
              autoComplete="off"
            />
            {search && (
              <button
                onMouseDown={e => { e.preventDefault(); setSearch(''); setSuggestOpen(false); router.replace('/referrals', { scroll: false }); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--relay-ink-3)' }}
                aria-label="Clear"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>

          {/* Suggestion dropdown */}
          {suggestOpen && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
              borderRadius: 10, boxShadow: 'var(--relay-shadow-pop)',
              overflow: 'hidden', zIndex: 600, minWidth: 280,
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={s.referralId ?? s.doctorName}
                  onMouseDown={e => { e.preventDefault(); commitSuggestion(s); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', cursor: 'pointer',
                    background: i === activeIdx ? 'var(--relay-tint)' : 'transparent',
                    borderBottom: i < suggestions.length - 1 ? '1px solid var(--relay-hairline)' : 'none',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: s.doctorName ? 'var(--relay-tint)' : 'var(--relay-accent-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600,
                    color: s.doctorName ? 'var(--relay-ink-3)' : 'var(--relay-accent-700)',
                  }}>
                    {s.doctorName
                      ? <Icon name="user" size={13} />
                      : s.label.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--relay-ink-2)', lineHeight: 1.3 }}>
                      {highlight(s.label)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', lineHeight: 1.3, marginTop: 1 }}>
                      {s.doctorName ? `Referring provider · ${s.sub}` : s.sub}
                    </div>
                  </div>
                  {s.doctorName && (
                    <span style={{ fontSize: 11, color: 'var(--relay-ink-3)', background: 'var(--relay-tint)', padding: '2px 7px', borderRadius: 99 }}>
                      Doctor
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: 'var(--relay-hairline)', flexShrink: 0 }} />

        {/* Segmented control — joined buttons, active = solid teal */}
        <div style={{
          display: 'inline-flex',
          border: '1px solid var(--relay-hairline)',
          borderRadius: 8,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {STATE_FILTERS.map((f, i) => {
            const count = f.value === 'all'
              ? active.length
              : active.filter(r => r.state === f.value).length;
            const on = stateFilter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setStateFilter(f.value)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 13px',
                  border: 'none',
                  borderLeft: i > 0 ? '1px solid var(--relay-hairline)' : 'none',
                  background: on ? 'var(--relay-accent)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontWeight: on ? 600 : 400,
                  color: on ? '#fff' : 'var(--relay-ink-2)',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.1s, color 0.1s',
                }}
              >
                {f.dot && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: on ? 'rgba(255,255,255,0.7)' : f.dot,
                  }} />
                )}
                {f.label}
                <span style={{
                  fontSize: 11, fontWeight: 600, lineHeight: 1,
                  padding: '1px 5px', borderRadius: 99,
                  background: on ? 'rgba(255,255,255,0.22)' : 'var(--relay-tint)',
                  color: on ? '#fff' : 'var(--relay-ink-3)',
                  minWidth: 16, textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <span style={{ flex: 1 }} />
      </div>

      {/* Active referrals table */}
      <div style={{
        background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
        borderTop: 0, borderRadius: '0 0 var(--relay-radius) var(--relay-radius)', overflow: 'visible',
        marginBottom: 20,
      }}>
        <ReferralTable rows={filtered} showStatePicker onStateChange={handleStateChange} sort={sort} onSort={onSort} />
        {filtered.length === 0 && (
          <EmptyState title="No referrals match" sub="Try clearing filters or adjust the search." />
        )}
      </div>

      {/* Completed (Booked) section */}
      {booked.length > 0 && (
        <div style={{
          background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
          borderRadius: 'var(--relay-radius)', overflow: 'hidden',
        }}>
          <button
            onClick={() => setBookedOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: bookedOpen ? '1px solid var(--relay-hairline)' : 'none',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: 'var(--st-booked-fg)',
            }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--relay-ink)' }}>
              Completed — Booked
            </span>
            <span style={{
              fontSize: 11.5, padding: '1px 8px', borderRadius: 99, fontWeight: 500,
              background: 'var(--st-booked-bg)', color: 'var(--st-booked-fg)',
            }}>
              {booked.length}
            </span>
            <span style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginLeft: 2 }}>
              Appointment confirmed · appointment in practice system
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--relay-ink-3)', display: 'inline-flex', transform: bookedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
              <Icon name="chevron" size={12} />
            </span>
          </button>

          {bookedOpen && (
            <ReferralTable rows={applySort(booked)} sort={sort} onSort={onSort} />
          )}
        </div>
      )}
    </>
  );
}
