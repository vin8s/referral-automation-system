'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
import { EmptyState } from '@/components/shared/EmptyState';
import { confirmSlot, rejectSlot } from '@/lib/data';
import type { ConfirmQueueItem } from '@/lib/types';

interface ActionQueueListProps {
  items: ConfirmQueueItem[];
  compact?: boolean;
}

export function ActionQueueList({ items: initial, compact }: ActionQueueListProps) {
  const [items, setItems] = useState(initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  async function handleConfirm(referralId: string) {
    setConfirming(referralId);
    await confirmSlot(referralId);
    setConfirmed(prev => new Set([...prev, referralId]));
    setItems(prev => prev.filter(i => i.referralId !== referralId));
    setConfirming(null);
  }

  async function handleReject(referralId: string) {
    await rejectSlot(referralId);
    setItems(prev => prev.filter(i => i.referralId !== referralId));
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="Nothing waiting on you"
        sub="The AI will route confirmations here as patients accept slots."
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {items.map(item => (
        <div className="action-card" key={item.referralId}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="between" style={{ gap: 12, alignItems: 'baseline' }}>
              <div className="fw-6">
                {item.patient}
                <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--relay-ink-3)', fontSize: 13 }}>
                  · {item.reason}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', flexShrink: 0 }}>
                captured {item.capturedAgoMin}m ago
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 2 }}>
              {item.referringProvider} · {item.language} · {item.insurance}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="action-slot">
                <Icon name="cal" size={12} />
                {item.slot.day} · {item.slot.time} · {item.slot.provider}
              </span>
              {!compact && (
                <Link href={`/referrals/${item.referralId}`}>
                  <button className="btn btn-sm btn-ghost">
                    <Icon name="transcript" size={12} /> Transcript
                  </button>
                </Link>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
            <button
              className="btn btn-sm btn-primary"
              disabled={confirming === item.referralId}
              onClick={() => handleConfirm(item.referralId)}
            >
              <Icon name="check" size={12} />
              {confirming === item.referralId ? 'Confirming…' : 'Confirm'}
            </button>
            <div style={{ display: 'flex', gap: 4 }}>
              <Link href={`/referrals/${item.referralId}`}>
                <button className="btn btn-sm btn-ghost" title="View referral">
                  <Icon name="edit" size={12} />
                </button>
              </Link>
              <button
                className="btn btn-sm btn-ghost"
                title="Reject slot — re-enter outreach"
                onClick={() => handleReject(item.referralId)}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--relay-ink-4)', textAlign: 'right' }}>
              prototype
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
