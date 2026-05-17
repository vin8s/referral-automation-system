'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHead } from '@/components/layout/PageHead';
import { Avatar } from '@/components/shared/Avatar';
import { Icon } from '@/components/shared/Icon';
import { TranscriptPanel } from '@/components/shared/TranscriptPanel';
import { getConfirmQueue, confirmSlot, rejectSlot } from '@/lib/data';
import type { ConfirmQueueItem } from '@/lib/types';

function ConfirmCard({ item, onConfirm, onReject }: {
  item: ConfirmQueueItem;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    await onConfirm(item.referralId);
  }

  async function handleReject() {
    setBusy(true);
    await onReject(item.referralId);
  }

  return (
    <div className="card">
      <div className="between" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
          <Avatar name={item.patient} size="lg" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <div className="fw-6" style={{ fontSize: 15 }}>{item.patient}</div>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>
                {item.age}{item.sex} · {item.language} · {item.insurance}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--relay-ink-4)', fontVariantNumeric: 'tabular-nums' }}>
                {item.referralId}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--relay-ink-2)', marginTop: 4 }}>
              <span style={{ color: 'var(--relay-ink-3)' }}>Reason:</span> {item.reason} ·{' '}
              <span style={{ color: 'var(--relay-ink-3)' }}>Referred by</span> {item.referringProvider}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="action-slot" style={{ fontSize: 13, padding: '6px 12px' }}>
                <Icon name="cal" size={13} /> {item.slot.day} · {item.slot.time}
              </span>
              <span className="tag">{item.slot.provider}</span>
              {item.priority === 'urgent' && (
                <span style={{ fontSize: 11.5, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>
                  Urgent
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          captured {item.capturedAgoMin}m ago
        </div>
      </div>

      {item.summary && (
        <div className="transcript-summary" style={{ marginTop: 14, fontSize: 13 }}>
          <span className="fw-6">AI summary · </span>{item.summary}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy} onClick={handleConfirm}>
          <Icon name="check" size={13} /> Confirm — booked in practice system
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={handleReject}>
          <Icon name="x" size={13} /> Reject (re-outreach)
        </button>
        <Link href={`/referrals/${item.referralId}`}>
          <button className="btn"><Icon name="edit" size={13} /> View referral</button>
        </Link>
        <span style={{ flex: 1 }} />
        <button
          className="collapse-toggle"
          onClick={() => setShowTranscript(s => !s)}
        >
          <Icon name="transcript" size={12} />
          {showTranscript ? 'Hide transcript' : 'View transcript'}
          <Icon name="chevron" size={11} />
        </button>
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--relay-ink-4)', marginTop: 6 }}>(prototype — does not write to real practice system)</div>

      {showTranscript && (
        <div style={{ marginTop: 14 }}>
          <TranscriptPanel
            data={{
              patient: item.patient,
              call: `Attempt · Voice · slot accepted`,
              disclosure: true,
              summary: item.summary,
              turns: item.transcript,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function ActionPage() {
  const [items, setItems] = useState<ConfirmQueueItem[]>([]);

  useEffect(() => {
    getConfirmQueue().then(setItems);
  }, []);

  async function handleConfirm(referralId: string) {
    await confirmSlot(referralId);
    setItems(prev => prev.filter(i => i.referralId !== referralId));
  }

  async function handleReject(referralId: string) {
    await rejectSlot(referralId);
    setItems(prev => prev.filter(i => i.referralId !== referralId));
  }

  return (
    <>
      <PageHead
        title="Confirm captured slots"
        sub="The AI captured these slots on calls. Commit them in your practice system, then mark confirmed."
      >
        <span className="tag" style={{ background: 'var(--relay-accent-50)', borderColor: 'var(--relay-accent-200)', color: 'var(--relay-accent-800)' }}>
          <Icon name="info" size={11} /> Connector mode · MVP
        </span>
        <button className="btn btn-sm"><Icon name="filter" size={12} /> Filters</button>
      </PageHead>

      <div className="alerts-strip calm" style={{ marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--relay-accent-50)', color: 'var(--relay-accent-700)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="info" size={14} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>How this works</div>
          <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 2 }}>
            AI captures an accepted slot → it lands here → you confirm in your scheduling system → Relay mirrors it.
            The richer native approval queue (AI writes directly) lands post-migration.
          </div>
        </div>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        {items.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--relay-ink-3)' }}>
            <Icon name="check" size={24} />
            <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14 }}>Nothing waiting on you</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>The AI will route confirmations here as patients accept slots.</div>
          </div>
        )}
        {items.map(item => (
          <ConfirmCard
            key={item.referralId}
            item={item}
            onConfirm={handleConfirm}
            onReject={handleReject}
          />
        ))}
      </div>
    </>
  );
}
