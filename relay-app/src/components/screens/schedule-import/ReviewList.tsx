'use client';

// eCW rows Relay would not guess on (ambiguous, possible match, conflicts, unknown
// status, Escalated referral). Staff pick the referral or ignore the row.
// Soft amber "needs a human" treatment — these never change a state by themselves.

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { NeedsHumanPill } from '@/components/shared/NeedsHumanList';
import { StatePill } from '@/components/shared/StatePill';
import { resolveScheduleReviewItem } from '@/lib/data';
import type { EcwReviewItem } from '@/lib/types';

function ReviewRow({ item, onDone }: { item: EcwReviewItem; onDone: () => void }) {
  const [pick, setPick] = useState(item.candidates[0]?.referralId ?? '');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const open = item.status === 'open';

  async function decide(decision: { action: 'match'; referralId: string } | { action: 'ignore' }) {
    setBusy(true);
    setMsg(null);
    const r = await resolveScheduleReviewItem(item.id, decision);
    setBusy(false);
    if (r.success) { setMsg({ ok: true, text: r.outcome ?? 'Done' }); onDone(); }
    else setMsg({ ok: false, text: r.errorMsg ?? 'Could not save.' });
  }

  const target = (other.trim() || pick).toUpperCase();

  return (
    <div className={open ? 'alerts-strip' : 'action-card'} style={{ alignItems: 'flex-start', padding: '12px 14px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {open ? <NeedsHumanPill label={item.reasonLabel} /> : <span className="tag">{item.status === 'matched' ? 'Matched' : 'Ignored'}</span>}
          <span className="fw-6" style={{ fontSize: 13 }}>{item.row.patient}</span>
          <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>
            {[item.row.dob && `DOB ${item.row.dob}`, item.row.mrn && `MRN ${item.row.mrn}`].filter(Boolean).join(' · ')}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--relay-ink-4)' }}>row {item.rowNumber}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', marginTop: 4 }}>
          <Icon name="cal" size={12} /> {item.row.date} · {item.row.time}{item.row.provider ? ` · ${item.row.provider}` : ''} · eCW status <b>{item.row.status}</b>
        </div>
        {item.detail && <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 2 }}>{item.detail}</div>}

        {item.candidates.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {item.candidates.map(c => (
              <label key={c.referralId} className={`chip${open && pick === c.referralId && !other ? ' active' : ''}`} style={{ cursor: open ? 'pointer' : 'default' }}>
                {open && (
                  <input type="radio" name={`pick-${item.id}`} checked={pick === c.referralId && !other} style={{ margin: 0 }}
                    onChange={() => { setPick(c.referralId); setOther(''); }} />
                )}
                <Link href={`/referrals/${c.referralId}`} className="name-link" onClick={e => e.stopPropagation()}>{c.patient}</Link>
                <span className="tnum" style={{ color: 'var(--relay-ink-4)' }}>{c.referralId}</span>
                {c.dob && <span style={{ color: 'var(--relay-ink-3)' }}>DOB {c.dob}</span>}
                <StatePill state={c.state} />
              </label>
            ))}
          </div>
        )}

        {!open && item.outcome && (
          <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 6 }}>
            {item.outcome}{item.resolvedBy ? ` — ${item.resolvedBy}` : ''}{item.resolvedAt ? `, ${item.resolvedAt}` : ''}
          </div>
        )}
        {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? 'var(--relay-accent-700)' : '#b91c1c' }}>{msg.text}</div>}
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', width: 220, flexShrink: 0 }}>
          <input
            className="select-sm" placeholder="Other referral ID (REF-…)" value={other}
            onChange={e => setOther(e.target.value)} aria-label="Other referral ID"
          />
          <button className="btn btn-sm btn-primary" disabled={busy || !target} onClick={() => decide({ action: 'match', referralId: target })}>
            <Icon name="check" size={11} /> {busy ? 'Saving…' : `Match to ${target || 'referral'}`}
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => decide({ action: 'ignore' })}>
            <Icon name="x" size={11} /> Ignore this row
          </button>
        </div>
      )}
    </div>
  );
}

export function ReviewList({ items, onChanged }: { items: EcwReviewItem[]; onChanged: () => void }) {
  if (items.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--relay-ink-3)', padding: '8px 0' }}>Nothing to review for this import.</div>;
  }
  return (
    <div className="stack-tight" style={{ gap: 8 }}>
      {items.map(item => <ReviewRow key={item.id} item={item} onDone={onChanged} />)}
    </div>
  );
}
