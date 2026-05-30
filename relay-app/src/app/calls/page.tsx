'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { TranscriptPanel } from '@/components/shared/TranscriptPanel';
import { getReferralLog } from '@/lib/data';
import type { ReferralLogEntry } from '@/lib/types';

function typeChipStyle(type: ReferralLogEntry['type']): { bg: string; fg: string; label: string } {
  if (type === 'ai_call')       return { bg: 'var(--st-outreach-bg)',  fg: 'var(--st-outreach-fg)',  label: 'AI call'        };
  if (type === 'manual_update') return { bg: 'var(--st-queued-bg)',    fg: 'var(--st-queued-fg)',    label: 'Manual update'  };
  return                               { bg: 'var(--relay-tint)',       fg: 'var(--relay-ink-3)',     label: 'System'         };
}

function LogDetailModal({ entry, onClose }: { entry: ReferralLogEntry; onClose: () => void }) {
  return (
    <div className="modal-shade" onClick={onClose}>
      <div className="relay-modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
        <div className="relay-modal-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>{entry.patient}</h3>
              {entry.attempt != null && (
                <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>· attempt #{entry.attempt}</span>
              )}
              {entry.escalated && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                  background: 'var(--st-escalated-bg)', color: 'var(--st-escalated-fg)',
                }}>Escalated</span>
              )}
            </div>
            <p className="card-sub">
              {entry.at}
              {entry.channel && ` · ${entry.channel === 'voice' ? 'Voice' : 'SMS'}`}
              {entry.duration && ` · ${entry.duration}`}
            </p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={13} /></button>
        </div>
        <div className="relay-modal-body">
          {entry.detail ? (
            <TranscriptPanel
              data={{
                patient: entry.patient,
                call: `${entry.referralId} · ${entry.what}`,
                disclosure: entry.disclosurePlayed ?? false,
                summary: entry.detail,
                turns: [],
              }}
            />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--relay-ink-2)', padding: '8px 0' }}>{entry.what}</div>
          )}
          <div className="relay-divider" />
          <div className="stack-tight" style={{ fontSize: 12.5 }}>
            <div className="between">
              <span style={{ color: 'var(--relay-ink-3)' }}>Who</span>
              <span>{entry.who}</span>
            </div>
            {entry.disclosurePlayed != null && (
              <div className="between">
                <span style={{ color: 'var(--relay-ink-3)' }}>Disclosure played</span>
                <span>{entry.disclosurePlayed ? 'Yes' : 'n/a'}</span>
              </div>
            )}
            {entry.escalated != null && (
              <div className="between">
                <span style={{ color: 'var(--relay-ink-3)' }}>Escalation raised</span>
                <span>{entry.escalated ? 'Yes — clinical' : 'No'}</span>
              </div>
            )}
            <div className="between">
              <span style={{ color: 'var(--relay-ink-3)' }}>Open referral</span>
              <Link href={`/referrals/${entry.referralId}`}><span className="name-link">{entry.referralId}</span></Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CallsPage() {
  const [log, setLog] = useState<ReferralLogEntry[]>([]);
  const [selected, setSelected] = useState<ReferralLogEntry | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'ai_call' | 'manual_update' | 'system'>('all');

  useEffect(() => {
    getReferralLog().then(setLog);
  }, []);

  const filters: { key: 'all' | 'ai_call' | 'manual_update' | 'system'; label: string }[] = [
    { key: 'all',           label: 'All'            },
    { key: 'ai_call',       label: 'AI calls'       },
    { key: 'manual_update', label: 'Manual updates' },
    { key: 'system',        label: 'System events'  },
  ];

  const filtered = typeFilter === 'all' ? log : log.filter(e => e.type === typeFilter);

  return (
    <>
      <PageHead
        title="Referral log"
        sub="All activity — AI calls, manual edits, and system events, across every referral."
      >
        <button className="btn btn-sm"><Icon name="download" size={12} /> Export</button>
      </PageHead>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {filters.map(f => (
          <button
            key={f.key}
            className={`chip${typeFilter === f.key ? ' active' : ''}`}
            onClick={() => setTypeFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 'var(--relay-radius)', overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Time</th>
              <th>Patient</th>
              <th>Referral</th>
              <th>Type</th>
              <th>Who</th>
              <th>Event</th>
              <th>Detail</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => {
              const chip = typeChipStyle(entry.type);
              return (
                <tr
                  key={i}
                  className={entry.type === 'ai_call' ? 'row-clickable' : undefined}
                  onClick={entry.type === 'ai_call' ? () => setSelected(entry) : undefined}
                  style={{ cursor: entry.type === 'ai_call' ? 'pointer' : 'default' }}
                >
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, whiteSpace: 'nowrap' }}>{entry.at}</td>
                  <td><span className="name-link">{entry.patient}</span></td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                    <Link href={`/referrals/${entry.referralId}`} onClick={e => e.stopPropagation()}>
                      <span className="name-link">{entry.referralId}</span>
                    </Link>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 99,
                      background: chip.bg, color: chip.fg, whiteSpace: 'nowrap',
                    }}>
                      {chip.label}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>{entry.who}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.what}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.type !== 'ai_call' ? entry.detail ?? '—' : (
                      <span style={{ color: 'var(--relay-ink-4)', fontStyle: 'italic' }}>
                        {entry.detail ? entry.detail.substring(0, 80) + (entry.detail.length > 80 ? '…' : '') : '—'}
                      </span>
                    )}
                  </td>
                  <td>
                    {entry.type === 'ai_call' && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={e => { e.stopPropagation(); setSelected(entry); }}
                      >
                        <Icon name="arrow" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--relay-ink-3)', fontSize: 13 }}>
            No entries match the current filter.
          </div>
        )}
      </div>

      {selected && <LogDetailModal entry={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
