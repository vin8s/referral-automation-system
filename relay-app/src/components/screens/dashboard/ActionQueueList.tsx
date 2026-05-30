'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 24px', gap: 10 }}>
        {/* Bird in flight illustration */}
        <svg width="96" height="60" viewBox="0 0 96 60" fill="none" style={{ color: 'var(--relay-accent)', opacity: 0.55 }}>
          {/* Main bird */}
          <path d="M48 32 Q34 18 14 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          <path d="M48 32 Q62 18 82 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          <ellipse cx="54" cy="28" rx="5" ry="4" fill="currentColor" opacity="0.25"/>
          <path d="M59 27 L65 25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          {/* Small bird left */}
          <path d="M22 14 Q17 9 10 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          <path d="M22 14 Q27 9 34 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          {/* Small bird right */}
          <path d="M70 10 Q65 5 58 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.35"/>
          <path d="M70 10 Q75 5 82 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.35"/>
        </svg>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--relay-ink-2)' }}>You&apos;re all caught up</div>
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', textAlign: 'center', maxWidth: 260 }}>
          The AI will route new slots here as patients accept them.
        </div>
      </div>
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
