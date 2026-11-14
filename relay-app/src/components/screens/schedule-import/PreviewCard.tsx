'use client';

// Step 3 of the eCW import: the dry run. One line per eCW row with the matched
// referral (and how sure the match is) and what Apply would do. Nothing has
// changed yet; Apply is the only button that changes Relay (never eCW).

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { StatePill } from '@/components/shared/StatePill';
import type { EcwImportCounts, EcwImportPreview, EcwPreviewRow } from '@/lib/types';
import { ActionTag } from './ActionTag';

type Filter = 'changes' | 'review' | 'all' | 'unchanged' | 'ignored';

const isChange = (r: EcwPreviewRow) => ['book', 'update_time', 'record_visit', 'reenter_cancelled', 'reenter_no_show', 'reenter_rescheduled'].includes(r.action);

export function changeCount(c: EcwImportCounts): number {
  return c.booked + c.updated + c.visits + c.reentered;
}

export function CountsLine({ counts }: { counts: EcwImportCounts }) {
  const parts: [string, number][] = [
    ['Mark Booked', counts.booked], ['Time updated', counts.updated], ['Visits recorded', counts.visits],
    ['Back to outreach', counts.reentered], ['Needs review', counts.review], ['No change', counts.unchanged],
    ['Not in Relay', counts.ignored], ["Can't read", counts.invalid],
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {parts.filter(([, n]) => n > 0).map(([label, n]) => (
        <span key={label} className="tag" style={label === 'Needs review' ? { background: 'var(--relay-urgent-50)', borderColor: 'var(--relay-urgent-200)', color: 'var(--relay-urgent-700)' } : undefined}>
          <span className="tnum fw-6" style={{ marginRight: 4 }}>{n}</span>{label}
        </span>
      ))}
    </div>
  );
}

export function PreviewCard({
  preview, busyProviders, onBusyProviders, providerMapped,
}: {
  preview: EcwImportPreview;
  busyProviders: string[] | null;
  onBusyProviders: (p: string[]) => void;
  providerMapped: boolean;
}) {
  const [filter, setFilter] = useState<Filter>(preview.counts.review > 0 ? 'review' : 'changes');
  const rows = useMemo(() => preview.rows.filter(r =>
    filter === 'all' ? true
      : filter === 'changes' ? isChange(r)
      : filter === 'review' ? r.action === 'review'
      : filter === 'unchanged' ? r.action === 'none'
      : r.action === 'ignore' || r.action === 'invalid'), [preview.rows, filter]);
  const c = preview.counts;
  const chosen = new Set(busyProviders ?? preview.defaultBusyProviders);

  const tabs: [Filter, string, number][] = [
    ['changes', 'Changes', changeCount(c)], ['review', 'Needs review', c.review], ['unchanged', 'No change', c.unchanged],
    ['ignored', 'Not in Relay / unreadable', c.ignored + c.invalid], ['all', 'All rows', c.total],
  ];

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ padding: '16px 20px 12px', marginBottom: 0 }}>
        <div>
          <h3>3 · Preview — nothing has changed yet</h3>
          <p className="card-sub">
            {c.total} rows · appointments {preview.rangeStart}{preview.rangeEnd && preview.rangeEnd !== preview.rangeStart ? ` – ${preview.rangeEnd}` : ''} ·
            {' '}{c.matched} matched to a referral
          </p>
        </div>
      </div>
      <div style={{ padding: '0 20px 12px' }}><CountsLine counts={c} /></div>

      <div style={{ display: 'flex', gap: 6, padding: '0 20px 12px', flexWrap: 'wrap' }}>
        {tabs.map(([id, label, n]) => (
          <button key={id} className={`chip${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>
            {label} <span className="tnum" style={{ color: 'var(--relay-ink-4)' }}>{n}</span>
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--relay-hairline)', overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 48 }}>Row</th>
              <th>eCW patient</th>
              <th>Appointment</th>
              <th>eCW status</th>
              <th>Relay referral</th>
              <th>Match</th>
              <th>What Apply does</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--relay-ink-3)', height: 64 }}>No rows in this view.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.rowNumber} style={r.action === 'review' ? { background: 'var(--relay-urgent-50)' } : undefined}>
                <td className="tnum" style={{ color: 'var(--relay-ink-4)', fontSize: 12 }}>{r.rowNumber}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.patient}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
                    {[r.dob && `DOB ${r.dob}`, r.mrn && `MRN ${r.mrn}`].filter(Boolean).join(' · ') || '—'}
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div className="tnum">{r.date ?? '—'}{r.time ? ` · ${r.time}` : ''}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{r.provider ?? ''}</div>
                </td>
                <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{r.status}</td>
                <td>
                  {r.referralId ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                      <Link href={`/referrals/${r.referralId}`} className="name-link" style={{ fontSize: 13 }}>{r.referralPatient}</Link>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="tnum" style={{ fontSize: 11.5, color: 'var(--relay-ink-4)' }}>{r.referralId}</span>
                        {r.referralState && <StatePill state={r.referralState} />}
                      </span>
                    </div>
                  ) : r.candidates?.length ? (
                    <div style={{ fontSize: 12, color: 'var(--relay-ink-2)' }}>
                      {r.candidates.map(cnd => <div key={cnd.referralId}>{cnd.patient} <span className="tnum" style={{ color: 'var(--relay-ink-4)' }}>{cnd.referralId}</span></div>)}
                    </div>
                  ) : <span style={{ color: 'var(--relay-ink-4)' }}>—</span>}
                </td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {r.matchLabel ? (
                    <span title={r.confidence === 'high' ? 'High confidence' : 'Medium confidence — check the referral'}>
                      {r.matchLabel}
                      <span style={{ marginLeft: 6, color: r.confidence === 'high' ? 'var(--relay-accent-700)' : 'var(--relay-urgent-700)' }}>
                        {r.confidence === 'high' ? '● high' : '◐ medium'}
                      </span>
                    </span>
                  ) : <span style={{ color: 'var(--relay-ink-4)' }}>—</span>}
                </td>
                <td>
                  <ActionTag action={r.action} label={r.actionLabel} />
                  {r.detail && <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', marginTop: 3, maxWidth: 320 }}>{r.detail}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {providerMapped && preview.providers.length > 0 && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--relay-hairline)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--relay-ink-2)' }}>Schedules that block the times the AI offers</div>
          <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', margin: '2px 0 8px' }}>
            Relay will not offer patients a time when these providers are already booked in eCW. Pre-selected: providers seeing referral patients in this file.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {preview.providers.map(p => (
              <label key={p} className={`chip${chosen.has(p) ? ' active' : ''}`}>
                <input
                  type="checkbox" checked={chosen.has(p)} style={{ margin: 0 }}
                  onChange={e => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(p); else next.delete(p);
                    onBusyProviders([...next].sort());
                  }}
                />
                {p}
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--relay-hairline)', fontSize: 12, color: 'var(--relay-ink-3)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Icon name="info" size={12} />
        <span>
          Matching: MRN first, then date of birth + name, then date of birth + phone. Relay never guesses — anything unclear goes to review.
          Patients with no referral in Relay are only counted, not stored. Relay never changes anything in eCW.
        </span>
      </div>
    </div>
  );
}
