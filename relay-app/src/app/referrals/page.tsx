'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatePill } from '@/components/shared/StatePill';
import { getReferrals } from '@/lib/data';
import { StatePicker } from '@/components/shared/StatePicker';
import type { Referral, ReferralState } from '@/lib/types';

const STATE_FILTERS = [
  { value: 'all',                  label: 'All' },
  { value: 'Queued',               label: 'Queued' },
  { value: 'In Progress',          label: 'In Progress' },
  { value: 'Pending Confirmation', label: 'Pending Confirmation' },
  { value: 'Escalated',            label: 'Escalated' },
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
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'id', dir: 'desc' });
  const [bookedOpen, setBookedOpen] = useState(false);

  useEffect(() => { getReferrals().then(setReferrals); }, []);

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
    if (urgentOnly) rows = rows.filter(r => r.priority === 'urgent');
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.patient.name.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.referringProvider.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return applySort(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stateFilter, urgentOnly, search, sort]);

  function onSort(col: string) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  return (
    <>
      <PageHead title="Referrals" sub={`${filtered.length} of ${active.length} active referrals`}>
        <button className="btn btn-sm"><Icon name="download" size={12} /> Export</button>
        <button className="btn btn-sm btn-primary"><Icon name="upload" size={12} /> Ingest</button>
      </PageHead>

      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 12, padding: '10px 14px',
        background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
        borderRadius: 'var(--relay-radius) var(--relay-radius) 0 0',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 9px', background: 'var(--relay-tint)',
          border: '1px solid var(--relay-hairline)', borderRadius: 7,
          maxWidth: 280, flex: '0 1 280px',
        }}>
          <Icon name="search" size={13} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search patient, reason, provider…"
            style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 13, color: 'var(--relay-ink)', fontFamily: 'inherit' }}
          />
        </div>
        {STATE_FILTERS.map(f => (
          <button key={f.value} className={`chip${stateFilter === f.value ? ' active' : ''}`} onClick={() => setStateFilter(f.value)}>
            {f.label}
          </button>
        ))}
        <span style={{ color: 'var(--relay-ink-4)', fontSize: 13 }}>·</span>
        <button className={`chip${urgentOnly ? ' active' : ''}`} onClick={() => setUrgentOnly(v => !v)}>
          <Icon name="alert" size={11} /> Urgent only
        </button>
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
