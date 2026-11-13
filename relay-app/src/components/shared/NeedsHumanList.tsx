'use client';

// Amber "needs a human" items (AGENT_SAFETY_RULES R2). Deliberately the soft amber
// treatment (--relay-urgent-*), never the red Escalated pill: these do not change
// the referral state.

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from './Icon';
import { resolveNeedsHumanItem } from '@/lib/data';
import type { NeedsHumanItem } from '@/lib/types';

export function NeedsHumanPill({ label = 'Needs a human' }: { label?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '2px 9px',
      borderRadius: 99, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--relay-urgent)' }} />
      {label}
    </span>
  );
}

export function NeedsHumanList({
  items, onResolved, showPatient = false,
}: { items: NeedsHumanItem[]; onResolved?: (id: string) => void; showPatient?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return null;

  async function resolve(id: string) {
    setBusy(id);
    const r = await resolveNeedsHumanItem(id);
    setBusy(null);
    if (r.success) onResolved?.(id);
  }

  return (
    <div className="stack-tight" style={{ gap: 8 }}>
      {items.map(item => (
        <div key={item.id} className="alerts-strip" style={{ padding: '10px 14px', alignItems: 'flex-start' }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <Icon name="user" size={13} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="fw-6" style={{ fontSize: 13 }}>{item.reasonLabel}</span>
              {showPatient && (
                <Link href={`/referrals/${item.referralId}`}><span className="name-link" style={{ fontSize: 13 }}>{item.patient}</span></Link>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{item.raisedAt}</span>
              {item.pauseAutomation && <span className="tag">Texting paused</span>}
            </div>
            {item.summary && <div style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', marginTop: 3 }}>{item.summary}</div>}
          </div>
          <button className="btn btn-sm" disabled={busy === item.id} onClick={() => resolve(item.id)}>
            <Icon name="check" size={11} /> {busy === item.id ? 'Saving…' : 'Mark handled'}
          </button>
        </div>
      ))}
    </div>
  );
}
