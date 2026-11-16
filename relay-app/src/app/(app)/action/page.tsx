'use client';

// Confirm queue — the MA's single work list, top to bottom:
//   1. Red Escalated referrals (safety: emergency / crisis). Claim, then resolve
//      by moving the referral out of Escalated once the patient is safe.
//   2. Amber "needs a human" items raised by the texting assistant or the eCW
//      import. They never change the referral state; "Mark handled" resolves them.
//   3. AI-captured slots to confirm in the practice system.
// Red and amber are deliberately separate sections with separate treatments.

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { PageHead } from '@/components/layout/PageHead';
import { Avatar } from '@/components/shared/Avatar';
import { Icon } from '@/components/shared/Icon';
import { SmsThread } from '@/components/shared/SmsThread';
import { StatePicker } from '@/components/shared/StatePicker';
import { NeedsHumanList } from '@/components/shared/NeedsHumanList';
import { ScheduleFreshnessBanner } from '@/components/shared/ScheduleFreshnessBanner';
import { getConfirmQueue, confirmSlot, rejectSlot, claimEscalation } from '@/lib/data';
import type { ConfirmQueue, ConfirmQueueItem, EscalationItem, ReferralState } from '@/lib/types';

// ── Section header ───────────────────────────────────────────────────────────

function SectionHead({ id, tone, title, sub, count, children }: {
  id: string; tone: 'escalated' | 'amber' | 'accent'; title: string; sub: string; count: number; children?: React.ReactNode;
}) {
  const chip = tone === 'escalated'
    ? { background: 'var(--st-escalated-bg)', color: 'var(--st-escalated-fg)' }
    : tone === 'amber'
      ? { background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)' }
      : { background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)' };
  return (
    <div id={id} className="between" style={{ alignItems: 'flex-end', gap: 16, margin: '8px 0 10px', scrollMarginTop: 72 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, ...chip }}>{count}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 3 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

// ── 1. Red escalation card ───────────────────────────────────────────────────

function EscalationCard({ item, onClaim, onResolved }: {
  item: EscalationItem;
  onClaim: (id: string) => Promise<void>;
  onResolved: (id: string, next: ReferralState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const claimed = !!item.owner;
  const lastPatient = [...item.excerpt].reverse().find(t => t.who === 'patient') ?? item.excerpt[item.excerpt.length - 1];

  return (
    <div className="card" style={{
      // Red = Escalated (safety). Never the amber "needs a human" treatment.
      borderColor: claimed ? 'var(--relay-hairline)' : '#fecaca',
      background: claimed ? 'var(--relay-surface)' : '#fef2f2',
      boxShadow: claimed ? undefined : 'inset 3px 0 0 var(--st-escalated-fg)',
    }}>
      <div className="between" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: 'var(--st-escalated-bg)', color: 'var(--st-escalated-fg)',
            display: 'grid', placeItems: 'center',
          }}>
            <Icon name="alert" size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="fw-6">{item.reason}</div>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>· {item.raisedAt}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Patient: <Link href={`/referrals/${item.referralId}`}><span className="name-link">{item.patient}</span></Link>
              <span style={{ color: 'var(--relay-ink-3)' }}> · {item.referralId}</span>
            </div>
            {lastPatient && (
              <div className="transcript-summary" style={{ marginTop: 10, fontSize: 12.5, borderLeftColor: 'var(--st-escalated-fg)' }}>
                <span className="fw-6">{lastPatient.who === 'patient' ? 'Patient texted' : 'Assistant'} · </span>
                &ldquo;{lastPatient.text}&rdquo;
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
          {claimed ? (
            <span style={{ fontSize: 11.5, background: 'var(--st-outreach-bg)', color: 'var(--st-outreach-fg)', padding: '2px 9px', borderRadius: 99, fontWeight: 500 }}>
              In progress · {item.owner}
            </span>
          ) : (
            <button
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={async () => { setBusy(true); await onClaim(item.referralId); setBusy(false); }}
            >
              <Icon name="check" size={12} /> {busy ? 'Claiming…' : <>I&apos;ll take it</>}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
            Resolve:
            <StatePicker referralId={item.referralId} current="Escalated" onChange={onResolved} />
          </div>
          <Link href={`/referrals/${item.referralId}`}>
            <button className="btn btn-sm btn-ghost">View texts <Icon name="arrow" size={11} /></button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── 3. Slot confirm card ─────────────────────────────────────────────────────

function ConfirmCard({ item, onConfirm, onReject }: {
  item: ConfirmQueueItem;
  /** Resolves to an error message to show on the card, or null when the card can leave the queue. */
  onConfirm: (id: string) => Promise<string | null>;
  onReject: (id: string) => Promise<void>;
}) {
  const [showThread, setShowThread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excerpt = item.smsExcerpt ?? [];

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
              <span className="tag" title="The patient picked this time by text">
                <Icon name="sms" size={11} />&nbsp;Picked by text
              </span>
              {item.priority === 'urgent' && (
                <span style={{ fontSize: 11.5, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>
                  Urgent
                </span>
              )}
            </div>
          </div>
        </div>
        {item.capturedAgoMin != null && (
          <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            captured {item.capturedAgoMin}m ago
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className="btn btn-primary" disabled={busy}
          title={item.epicBooking ? 'Prototype: books this time in the Epic sandbox, then adds it to Relay\'s Calendar' : undefined}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const err = await onConfirm(item.referralId);
            if (err) { setError(err); setBusy(false); }
          }}
        >
          <Icon name="check" size={13} />{' '}
          {busy && item.epicBooking ? 'Booking in Epic…' : item.epicBooking ? 'Confirm — book in Epic (sandbox)' : 'Confirm — booked in practice system'}
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={async () => { setBusy(true); await onReject(item.referralId); }}>
          <Icon name="x" size={13} /> Reject (re-outreach)
        </button>
        <Link href={`/referrals/${item.referralId}`}>
          <button className="btn"><Icon name="edit" size={13} /> View referral</button>
        </Link>
        {item.epicBooking && <span className="tag" title="Epic sandbox prototype: synthetic data only">Epic sandbox · prototype</span>}
        <span style={{ flex: 1 }} />
        <button className="collapse-toggle" onClick={() => setShowThread(s => !s)}>
          <Icon name="sms" size={12} />
          {showThread ? 'Hide texts' : 'View texts'}
          <Icon name="chevron" size={11} />
        </button>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--relay-urgent-700)', background: 'var(--relay-urgent-50)', border: '1px solid var(--relay-urgent-200)', borderRadius: 8, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {showThread && (
        <div style={{ marginTop: 14 }}>
          <SmsThread messages={excerpt} maxHeight={320} compact emptyText="No texts recorded." />
        </div>
      )}
    </div>
  );
}

function EmptyCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--relay-ink-3)' }}>
      <Icon name="check" size={20} />
      <div style={{ marginTop: 8, fontWeight: 600, fontSize: 13.5 }}>{title}</div>
      <div style={{ fontSize: 12.5, marginTop: 3 }}>{sub}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const EMPTY_QUEUE: ConfirmQueue = { escalations: [], needsHuman: [], slots: [] };

export default function ActionPage() {
  const [queue, setQueue] = useState<ConfirmQueue>(EMPTY_QUEUE);
  const [loaded, setLoaded] = useState(false);
  const scrolledRef = useRef(false);

  const load = useCallback(async () => {
    const q = await getConfirmQueue();
    setQueue(q);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep links (/action#escalated, #needs-human, #slots) land on the section once it renders.
  useEffect(() => {
    if (!loaded || scrolledRef.current || !window.location.hash) return;
    scrolledRef.current = true;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [loaded]);

  const { escalations, needsHuman, slots } = queue;

  async function handleClaim(referralId: string) {
    await claimEscalation(referralId);
    await load();
  }

  function handleResolved(referralId: string, next: ReferralState) {
    if (next === 'Escalated') return;
    setQueue(q => ({ ...q, escalations: q.escalations.filter(e => e.referralId !== referralId) }));
    load();
  }

  async function handleConfirm(referralId: string): Promise<string | null> {
    const res = await confirmSlot(referralId);
    // Epic sandbox prototype: a taken slot was released and new times are offered by text, so the card leaves.
    if (res.success || res.code === 'slot_unavailable') {
      setQueue(q => ({ ...q, slots: q.slots.filter(i => i.referralId !== referralId) }));
      if (res.code === 'slot_unavailable') window.alert(res.error ?? 'That time is no longer open in Epic. New times will be offered by text.');
      return null;
    }
    return res.error ?? res.errorMsg ?? 'Could not confirm this slot. Try again.';
  }

  async function handleReject(referralId: string) {
    await rejectSlot(referralId);
    setQueue(q => ({ ...q, slots: q.slots.filter(i => i.referralId !== referralId) }));
  }

  // Oldest captured first, so nothing waits too long.
  const visible = [...slots].sort((a, b) => (b.capturedAgoMin ?? 0) - (a.capturedAgoMin ?? 0));

  const openEscalations = escalations.filter(e => !e.owner).length;

  return (
    <>
      <PageHead
        title="Confirm queue"
        sub="Everything waiting on you, most urgent first: escalations, then items that need a human, then slots to confirm."
      />

      <ScheduleFreshnessBanner />

      {/* 1 ── Red: Escalated */}
      <SectionHead
        id="escalated"
        tone="escalated"
        title="Escalated — act now"
        sub="Possible emergency or crisis. Texting is paused. Call the patient, then move the referral out of Escalated."
        count={escalations.length}
      >
        {escalations.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>
            {openEscalations} unclaimed · {escalations.length - openEscalations} in progress
          </span>
        )}
      </SectionHead>
      <div className="stack" style={{ gap: 12, marginBottom: 24 }}>
        {loaded && escalations.length === 0 && (
          <EmptyCard title="No escalations" sub="Nothing urgent right now." />
        )}
        {escalations.map(e => (
          <EscalationCard key={e.referralId} item={e} onClaim={handleClaim} onResolved={handleResolved} />
        ))}
      </div>

      {/* 2 ── Amber: needs a human */}
      <SectionHead
        id="needs-human"
        tone="amber"
        title="Needs a human"
        sub="Raised by the texting assistant or the eCW import. Normal work, same business day. The referral state does not change."
        count={needsHuman.length}
      />
      <div className="card" style={{ marginBottom: 24 }}>
        {loaded && needsHuman.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>Nothing waiting.</div>
        ) : (
          <NeedsHumanList
            items={needsHuman}
            showPatient
            onResolved={id => setQueue(q => ({ ...q, needsHuman: q.needsHuman.filter(i => i.id !== id) }))}
          />
        )}
      </div>

      {/* 3 ── Slots to confirm */}
      <SectionHead
        id="slots"
        tone="accent"
        title="Slots to confirm"
        sub="The patient picked these times by text. Book them in your practice system, then mark confirmed."
        count={slots.length}
      />

      <div className="stack" style={{ gap: 14 }}>
        {loaded && slots.length === 0 && (
          <EmptyCard title="No slots waiting" sub="Times patients pick by text land here for you to confirm." />
        )}
        {visible.map(item => (
          <ConfirmCard key={item.referralId} item={item} onConfirm={handleConfirm} onReject={handleReject} />
        ))}
        <div style={{ fontSize: 11.5, color: 'var(--relay-ink-4)' }}>
          Connector mode: Relay never writes to eCW. Confirming records that you booked the slot there (prototype).
        </div>
      </div>
    </>
  );
}
