'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getConfirmQueue, getReferrals } from '@/lib/data';
import { outcomeLabel } from '@/lib/format';
import { PageHead } from '@/components/layout/PageHead';
import { StatePill } from '@/components/shared/StatePill';
import { Icon } from '@/components/shared/Icon';
import { ActionQueueList } from '@/components/screens/dashboard/ActionQueueList';
import { useSession } from '@/contexts/SessionContext';
import { ScheduleFreshnessBanner } from '@/components/shared/ScheduleFreshnessBanner';
import { ReadyToTextCard } from '@/components/screens/dashboard/ReadyToTextCard';
import type { ConfirmQueue, Referral } from '@/lib/types';

// ── Referral quick-view modal ─────────────────────────────────────────────────
function ReferralQuickViewModal({ referral, onClose }: { referral: Referral; onClose: () => void }) {
  const r = referral;
  const lastAttempt = r.attempts[r.attempts.length - 1];

  return (
    <div className="modal-shade" onClick={onClose}>
      <div className="relay-modal" style={{ width: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="relay-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{r.patient.name}</h3>
            <StatePill state={r.state} />
            {r.priority === 'urgent' && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: 99 }}>Urgent</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/referrals/${r.id}`} onClick={onClose}>
              <button className="btn btn-sm btn-primary">Open full profile <Icon name="arrow" size={11} /></button>
            </Link>
            <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={13} /></button>
          </div>
        </div>

        <div className="relay-modal-body" style={{ overflowY: 'auto' }}>
          {/* Two-column facts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', marginBottom: 16 }}>
            {[
              ['Age / sex', `${r.patient.age} · ${r.patient.sex === 'F' ? 'Female' : 'Male'}`],
              ['Reason', r.reason],
              ['Language', r.patient.language],
              ['Referring provider', r.referringProvider],
              ['Insurance', r.patient.insurance],
              ['Received', r.referralTime],
              ['Outreach', `${r.attempts.length} text${r.attempts.length !== 1 ? 's' : ''}`],
              ['Referral ID', r.id],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--relay-hairline)', alignItems: 'baseline' }}>
                <span style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', flexShrink: 0, width: 120 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--relay-ink-2)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Captured slot */}
          {r.capturedSlot && (
            <div style={{ background: 'var(--relay-accent-50)', border: '1px solid var(--relay-accent-200)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--relay-accent-700)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Captured slot — pending confirmation</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                <Icon name="cal" size={13} /> {r.capturedSlot.day} · {r.capturedSlot.time} · {r.capturedSlot.provider}
              </div>
            </div>
          )}

          {/* Booked appointment */}
          {r.bookedAppointment && (
            <div style={{ background: 'var(--st-booked-bg)', border: '1px solid var(--relay-accent-200)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--relay-accent-700)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Confirmed appointment</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                <Icon name="cal" size={13} /> {r.bookedAppointment.day} · {r.bookedAppointment.time} · {r.bookedAppointment.provider}
              </div>
              <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 3 }}>
                Confirmed by {r.bookedAppointment.confirmedBy} · {r.bookedAppointment.confirmedAt}
              </div>
            </div>
          )}

          {/* Latest text outreach */}
          {lastAttempt && (
            <div className="transcript-summary" style={{ fontSize: 12.5 }}>
              <span className="fw-6">Text outreach #{lastAttempt.n} · {outcomeLabel(lastAttempt.outcome)} · </span>
              {lastAttempt.summary || lastAttempt.timestamp}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recent referrals table ────────────────────────────────────────────────────
function RecentReferralsTable({ rows, onRowClick }: { rows: Referral[]; onRowClick: (r: Referral) => void }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Patient</th><th>Reason</th><th>Referring</th><th>Received</th><th>State</th><th />
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr
            key={r.id}
            className={`row-clickable${r.priority === 'urgent' ? ' pri-urgent' : ''}`}
            onClick={() => onRowClick(r)}
            style={{ cursor: 'pointer' }}
          >
            <td>
              <div style={{ fontWeight: 500 }}>{r.patient.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
                {r.patient.age}{r.patient.sex} · {r.id}
              </div>
            </td>
            <td style={{ color: 'var(--relay-ink-2)' }}>{r.reason}</td>
            <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{r.referringProvider}</td>
            <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', fontVariantNumeric: 'tabular-nums' }}>
              {r.referralTime}
            </td>
            <td><StatePill state={r.state} /></td>
            <td onClick={e => e.stopPropagation()}>
              <Link href={`/referrals/${r.id}`}>
                <button className="btn btn-sm btn-ghost"><Icon name="arrow" size={12} /></button>
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useSession();
  const [queue, setQueue]                   = useState<ConfirmQueue>({ escalations: [], needsHuman: [], slots: [] });
  const [referrals, setReferrals]           = useState<Referral[]>([]);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);

  const fetchAll = useCallback(() => {
    Promise.all([getConfirmQueue(), getReferrals()]).then(([q, r]) => {
      setQueue(q);
      setReferrals(r);
    });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Called by ActionQueueList after a confirm/reject so the whole page reflects
  // the updated referral state from the data layer.
  const handleConfirmed = useCallback(() => { fetchAll(); }, [fetchAll]);

  const slots = queue.slots;

  return (
    <>
      <PageHead
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`}
        sub={`Today is ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
      />

      <ScheduleFreshnessBanner />

      <div className="stack">
        {/* Pilot mode: approve new referrals before their first text */}
        <ReadyToTextCard onApproved={fetchAll} />

        {/* Slots to confirm */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Slots to confirm</h3>
              <p className="card-sub">Times patients picked by text, awaiting confirmation in your practice system</p>
            </div>
            {slots.length > 0 && (
              <span style={{
                fontSize: 11.5, padding: '2px 9px', borderRadius: 99, fontWeight: 500,
                background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)',
              }}>
                {slots.length} pending
              </span>
            )}
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <ActionQueueList items={slots} compact onConfirmed={handleConfirmed} />
          </div>
        </div>

        {/* Recent referrals */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head" style={{ padding: '14px 16px 12px', marginBottom: 0, borderBottom: '1px solid var(--relay-hairline)' }}>
            <div>
              <h3>Recent referrals</h3>
              <p className="card-sub">8 most recent · newest first</p>
            </div>
            <Link href="/referrals">
              <button className="btn btn-sm btn-ghost">View all <Icon name="arrow" size={11} /></button>
            </Link>
          </div>
          <RecentReferralsTable rows={referrals.slice(0, 8)} onRowClick={setSelectedReferral} />
        </div>
      </div>

      {selectedReferral && (
        <ReferralQuickViewModal
          referral={selectedReferral}
          onClose={() => setSelectedReferral(null)}
        />
      )}
    </>
  );
}
