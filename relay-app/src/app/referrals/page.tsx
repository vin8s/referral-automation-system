'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PageHead } from '@/components/layout/PageHead';
import { StatePill } from '@/components/shared/StatePill';
import { Avatar } from '@/components/shared/Avatar';
import { Icon } from '@/components/shared/Icon';
import { EmptyState } from '@/components/shared/EmptyState';
import { getReferrals } from '@/lib/data';
import type { Referral, ReferralState } from '@/lib/types';

const STATE_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'Outreach', label: 'Outreach active' },
  { value: 'Slot accepted', label: 'Slot accepted' },
  { value: 'Booked', label: 'Booked' },
  { value: 'Queued', label: 'Queued' },
  { value: 'Escalated', label: 'Escalated' },
];

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'id', dir: 'desc' });

  useEffect(() => {
    getReferrals().then(setReferrals);
  }, []);

  const filtered = useMemo(() => {
    let rows = referrals;
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
    return [...rows].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (sort.col === 'id') return a.id > b.id ? dir : -dir;
      if (sort.col === 'state') return a.state > b.state ? dir : -dir;
      if (sort.col === 'patient') return a.patient.name > b.patient.name ? dir : -dir;
      return 0;
    });
  }, [referrals, stateFilter, urgentOnly, search, sort]);

  function onSort(col: string) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

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
    <>
      <PageHead
        title="Referrals"
        sub={`${filtered.length} of ${referrals.length} referrals`}
      >
        <button className="btn btn-sm"><Icon name="download" size={12} /> Export</button>
        <button className="btn btn-sm btn-primary"><Icon name="upload" size={12} /> Ingest</button>
      </PageHead>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, padding: '10px 14px', background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 'var(--relay-radius) var(--relay-radius) 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px', background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)', borderRadius: 7, maxWidth: 280, flex: '0 1 280px' }}>
          <Icon name="search" size={13} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search patient, reason, provider…"
            style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 13, color: 'var(--relay-ink)', fontFamily: 'inherit' }}
          />
        </div>
        {STATE_FILTERS.map(f => (
          <button
            key={f.value}
            className={`chip${stateFilter === f.value ? ' active' : ''}`}
            onClick={() => setStateFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
        <span style={{ color: 'var(--relay-ink-4)', fontSize: 13 }}>·</span>
        <button
          className={`chip${urgentOnly ? ' chip-urgent active' : ''}`}
          onClick={() => setUrgentOnly(v => !v)}
        >
          <Icon name="alert" size={11} /> Urgent only
        </button>
        <span style={{ flex: 1 }} />
        <button className="chip"><Icon name="filter" size={11} /> More filters</button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderTop: 0, borderRadius: '0 0 var(--relay-radius) var(--relay-radius)', overflow: 'hidden' }}>
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
            {filtered.map(r => {
              const lastAttempt = r.attempts[r.attempts.length - 1];
              return (
                <tr
                  key={r.id}
                  className={`row-clickable${r.priority === 'urgent' ? ' pri-urgent' : ''}`}
                >
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.patient.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{r.patient.age}{r.patient.sex} · {r.id}</div>
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{r.referringProvider}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', fontVariantNumeric: 'tabular-nums' }}>{r.referralTime}</td>
                  <td><StatePill state={r.state} /></td>
                  <td style={{ color: 'var(--relay-ink-2)' }}>{r.patient.language}</td>
                  <td style={{ color: 'var(--relay-ink-2)' }}>{r.patient.insurance}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
                    {lastAttempt?.summary ?? '—'}
                  </td>
                  <td>
                    <Link href={`/referrals/${r.id}`}>
                      <button className="btn btn-sm btn-ghost"><Icon name="arrow" size={12} /></button>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <EmptyState title="No referrals match" sub="Try clearing filters or adjust the search." />
        )}
      </div>
    </>
  );
}
