'use client';

// Pilot mode: "Ready to text". New referrals wait here until staff approve their
// first text. After approval, Relay sends it in the next sending window and runs
// the follow-ups by itself. Referrals that can't be texted show why (amber: needs a
// human) and can't be selected. All data goes through src/lib/data.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
import { approveForTexting, getReadyToText } from '@/lib/data';
import type { ReadyToTextItem, ReadyToTextView } from '@/lib/types';

export function ReadyToTextCard({ onApproved }: { onApproved?: () => void }) {
  const [view, setView] = useState<ReadyToTextView | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const v = await getReadyToText();
    setView(v);
    setChosen(prev => new Set([...prev].filter(id => v.items.some(i => i.referralId === id && !i.blocked))));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from the data layer
  useEffect(() => { load(); }, [load]);

  const ready = useMemo(() => (view?.items ?? []).filter(i => !i.blocked), [view]);
  const blocked = useMemo(() => (view?.items ?? []).filter(i => i.blocked), [view]);

  if (!view || !view.approvalRequired) return null;

  async function approve(ids: string[]) {
    if (!ids.length) return;
    setSaving(true);
    setNote(null);
    try {
      const r = await approveForTexting(ids);
      setNote(`${r.approved.length} approved. Their first text goes out in the next sending window; follow-ups run by themselves.`
        + (r.notApproved.length ? ` ${r.notApproved.length} could not be approved.` : ''));
      setChosen(new Set());
      await load();
      onApproved?.();
    } catch {
      setNote('Could not approve. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const toggle = (id: string) => setChosen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allChosen = ready.length > 0 && ready.every(i => chosen.has(i.referralId));

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ padding: '14px 16px 12px', marginBottom: 0, borderBottom: '1px solid var(--relay-hairline)' }}>
        <div>
          <h3>Ready to text</h3>
          <p className="card-sub">
            Pilot mode: review new referrals and approve them. Relay then sends the first text and the follow-ups by itself.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {view.items.length > 0 && (
            <span style={{
              fontSize: 11.5, padding: '2px 9px', borderRadius: 99, fontWeight: 500,
              background: 'var(--relay-accent-50)', color: 'var(--relay-accent-700)',
            }}>
              {ready.length} ready{blocked.length ? ` · ${blocked.length} need a fix` : ''}
            </span>
          )}
          <button className="btn btn-sm" disabled={saving || chosen.size === 0} onClick={() => approve([...chosen])}>
            <Icon name="check" size={12} /> Approve selected{chosen.size ? ` (${chosen.size})` : ''}
          </button>
          <button className="btn btn-sm btn-primary" disabled={saving || ready.length === 0} onClick={() => approve(ready.map(i => i.referralId))}>
            <Icon name="sms" size={12} /> Approve all ready ({ready.length})
          </button>
        </div>
      </div>

      {note && (
        <div style={{ padding: '10px 16px', fontSize: 12.5, borderBottom: '1px solid var(--relay-hairline)', background: 'var(--relay-tint)' }}>
          {note}
        </div>
      )}

      {view.items.length === 0 ? (
        <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--relay-ink-3)' }}>
          Nothing waiting. New referrals from <Link href="/ingest" style={{ color: 'var(--relay-accent-700)' }}>Ingest referrals</Link> appear here for approval.
        </div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox" aria-label="Select all ready" checked={allChosen} disabled={ready.length === 0 || saving}
                    onChange={() => setChosen(allChosen ? new Set() : new Set(ready.map(i => i.referralId)))}
                  />
                </th>
                <th>Patient</th><th>Mobile</th><th>Language</th><th>Specialty</th><th>Received</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...ready, ...blocked].map(i => <Row key={i.referralId} item={i} checked={chosen.has(i.referralId)} disabled={saving} onToggle={toggle} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ item: i, checked, disabled, onToggle }: {
  item: ReadyToTextItem; checked: boolean; disabled: boolean; onToggle: (id: string) => void;
}) {
  return (
    <tr className={i.priority === 'urgent' ? 'pri-urgent' : undefined}>
      <td>
        <input
          type="checkbox" aria-label={`Select ${i.patient}`} checked={checked}
          disabled={disabled || !!i.blocked} onChange={() => onToggle(i.referralId)}
        />
      </td>
      <td>
        <Link href={`/referrals/${i.referralId}`} style={{ fontWeight: 500, color: 'var(--relay-ink)' }}>{i.patient}</Link>
        <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
          {i.referralId}{i.priority === 'urgent' ? ' · Urgent: staff also call today' : ''}
        </div>
      </td>
      <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{i.phone || '—'}</td>
      <td style={{ fontSize: 12.5 }}>{i.language}</td>
      <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{i.specialty || '—'}</td>
      <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', fontVariantNumeric: 'tabular-nums' }}>{i.receivedAt}</td>
      <td>
        {i.blocked ? (
          <span style={{
            fontSize: 11.5, padding: '2px 8px', borderRadius: 99, fontWeight: 500, whiteSpace: 'nowrap',
            background: 'var(--relay-urgent-50)', color: 'var(--relay-urgent-700)', border: '1px solid var(--relay-urgent-200)',
          }}>
            {i.blocked}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Ready</span>
        )}
      </td>
    </tr>
  );
}
