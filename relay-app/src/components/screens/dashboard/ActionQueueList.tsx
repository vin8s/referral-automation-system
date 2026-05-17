'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
import { EmptyState } from '@/components/shared/EmptyState';
import { confirmSlot, rejectSlot } from '@/lib/data';
import type { ConfirmQueueItem } from '@/lib/types';

interface ActionQueueListProps {
  items: ConfirmQueueItem[];
  compact?: boolean;
  onConfirmed?: () => void;
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function ConfirmModal({
  item,
  onConfirm,
  onCancel,
  loading,
}: {
  item: ConfirmQueueItem;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.45)',
        display: 'grid', placeItems: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)',
      }}
      onMouseDown={onCancel}
    >
      <div
        style={{
          background: 'var(--relay-surface)',
          borderRadius: 12,
          padding: 28,
          width: 460,
          maxWidth: 'calc(100vw - 40px)',
          boxShadow: 'var(--relay-shadow-pop)',
          border: '1px solid var(--relay-hairline)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>Confirm booking</div>
            <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 3 }}>
              This will update the referral to <strong>Booked</strong> and mirror it to the shadow calendar.
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onCancel} style={{ marginLeft: 12, flexShrink: 0 }}>
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* Patient + slot details */}
        <div style={{ background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{item.patient}</div>
            {item.priority === 'urgent' && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#fee2e2', padding: '2px 7px', borderRadius: 99 }}>
                URGENT
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--relay-ink-2)', marginBottom: 10 }}>
            {item.reason} · {item.referringProvider}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="action-slot">
              <Icon name="cal" size={12} />
              {item.slot.day} · {item.slot.time} · {item.slot.provider}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--relay-ink-3)' }}>
            {item.language} · {item.insurance}
          </div>
        </div>

        {/* What happens */}
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginBottom: 20, lineHeight: 1.6 }}>
          Confirming will move this referral to <strong style={{ color: 'var(--relay-ink-2)' }}>Booked</strong>,
          update the referrals list and calendar, and mark it as mirrored to the shadow calendar.{' '}
          <span style={{ color: 'var(--relay-ink-4)' }}>(prototype — no write to practice system)</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={onConfirm}
            disabled={loading}
            style={{ minWidth: 130 }}
          >
            <Icon name="check" size={13} />
            {loading ? 'Confirming…' : 'Confirm booking'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Action queue list ─────────────────────────────────────────────────────────
export function ActionQueueList({ items: incoming, compact, onConfirmed }: ActionQueueListProps) {
  const [items, setItems] = useState<ConfirmQueueItem[]>(incoming);
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmQueueItem | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Sync when parent loads async data (useState only captures initial value)
  useEffect(() => {
    setItems(incoming);
  }, [incoming]);

  async function handleConfirmAccepted() {
    if (!pendingConfirm) return;
    setConfirming(true);
    await confirmSlot(pendingConfirm.referralId);
    setItems(prev => prev.filter(i => i.referralId !== pendingConfirm.referralId));
    setPendingConfirm(null);
    setConfirming(false);
    onConfirmed?.();
  }

  async function handleReject(referralId: string) {
    await rejectSlot(referralId);
    setItems(prev => prev.filter(i => i.referralId !== referralId));
    onConfirmed?.();
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
    <>
      {pendingConfirm && (
        <ConfirmModal
          item={pendingConfirm}
          onConfirm={handleConfirmAccepted}
          onCancel={() => !confirming && setPendingConfirm(null)}
          loading={confirming}
        />
      )}

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
                onClick={() => setPendingConfirm(item)}
              >
                <Icon name="check" size={12} />
                Confirm
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
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
