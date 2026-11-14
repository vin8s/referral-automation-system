'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getConfirmQueue, getPipeline, getReferrals,
  getOutreachLog, getCalendarEvents,
} from '@/lib/data';
import { outcomeLabel } from '@/lib/format';
import { PageHead } from '@/components/layout/PageHead';
import { StatePill } from '@/components/shared/StatePill';
import { Icon } from '@/components/shared/Icon';
import { ActionQueueList } from '@/components/screens/dashboard/ActionQueueList';
import { useSession } from '@/contexts/SessionContext';
import { ScheduleFreshnessBanner } from '@/components/shared/ScheduleFreshnessBanner';
import type {
  ConfirmQueue, PipelineCount, Referral,
  OutreachLogEntry, CalendarEvent,
} from '@/lib/types';

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

// ── Work-list strips: red escalations and amber needs-a-human, never merged ──

function WorkListStrips({ escalations, needsHuman }: { escalations: number; needsHuman: number }) {
  if (escalations === 0 && needsHuman === 0) return null;
  return (
    <div className="stack" style={{ gap: 10, marginBottom: 16 }}>
      {escalations > 0 && (
        <div className="alerts-strip escalated" role="alert">
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--st-escalated-bg)', color: 'var(--st-escalated-fg)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="alert" size={15} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--st-escalated-fg)' }}>
              {escalations} escalated referral{escalations !== 1 ? 's' : ''} — act now
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 2 }}>Possible emergency or crisis reported by text. Texting is paused.</div>
          </div>
          <Link href="/action#escalated"><button className="btn btn-sm">Open <Icon name="arrow" size={11} /></button></Link>
        </div>
      )}
      {needsHuman > 0 && (
        <div className="alerts-strip">
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name="user" size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{needsHuman} item{needsHuman !== 1 ? 's' : ''} need{needsHuman === 1 ? 's' : ''} a human</div>
            <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 2 }}>Questions, wrong numbers and eCW changes. Same business day.</div>
          </div>
          <Link href="/action#needs-human"><button className="btn btn-sm">Review <Icon name="arrow" size={11} /></button></Link>
        </div>
      )}
    </div>
  );
}

// ── Recent texting outreach card ──────────────────────────────────────────────

function OutreachLogCard({ entries }: { entries: OutreachLogEntry[] }) {
  const recent = entries.slice(0, 7);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="card-head">
        <div>
          <h3>Recent texting outreach</h3>
          <p className="card-sub">Most recent text attempts · click to expand</p>
        </div>
        <Link href="/messages">
          <button className="btn btn-sm btn-ghost">View all <Icon name="arrow" size={11} /></button>
        </Link>
      </div>
      <div style={{ gap: 0 }}>
        {recent.map((entry, i) => {
          const key = `${entry.referralId}-${entry.attempt}`;
          const isExpanded = expandedKey === key;
          const isLast = i === recent.length - 1;

          return (
            <div key={key} style={{ borderBottom: isLast && !isExpanded ? 'none' : '1px solid var(--relay-hairline)' }}>
              {/* Row */}
              <div
                onClick={() => setExpandedKey(isExpanded ? null : key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', cursor: 'pointer',
                  background: isExpanded ? 'var(--relay-tint)' : 'transparent',
                  margin: isExpanded ? '0 -16px' : undefined,
                  paddingLeft: isExpanded ? 16 : undefined,
                  paddingRight: isExpanded ? 16 : undefined,
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)',
                  display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--relay-ink-3)',
                }}>
                  <Icon name="sms" size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.patient}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
                    {entry.timestamp} · {outcomeLabel(entry.outcome)}
                  </div>
                </div>
                <StatePill state={entry.referralState} />
                <span style={{
                  color: 'var(--relay-ink-4)', display: 'inline-flex',
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 150ms', flexShrink: 0,
                }}>
                  <Icon name="chevron" size={11} />
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{
                  margin: '0 -16px',
                  padding: '12px 16px 14px',
                  background: 'var(--relay-tint)',
                  borderTop: '1px solid var(--relay-hairline)',
                }}>
                  {entry.summary && (
                    <div style={{
                      fontSize: 12.5, color: 'var(--relay-ink-2)', lineHeight: 1.5,
                      background: 'var(--relay-surface)', borderRadius: 6,
                      padding: '8px 10px', marginBottom: 10,
                      border: '1px solid var(--relay-hairline)',
                    }}>
                      <span style={{ fontWeight: 600, color: 'var(--relay-ink-3)', fontSize: 11 }}>AI summary · </span>
                      {entry.summary}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--relay-ink-3)', flexWrap: 'wrap', marginBottom: 10 }}>
                    <span>
                      <span style={{ color: 'var(--relay-ink-4)' }}>Attempt · </span>
                      #{entry.attempt}
                    </span>
                    <span>
                      <span style={{ color: 'var(--relay-ink-4)' }}>Language · </span>
                      {entry.language}
                    </span>
                    {entry.escalated && (
                      <span style={{ color: 'var(--st-escalated-fg)', fontWeight: 500 }}>⚑ Escalation raised</span>
                    )}
                  </div>
                  <Link href={`/referrals/${entry.referralId}`}>
                    <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }}>
                      Open referral {entry.referralId} <Icon name="arrow" size={11} />
                    </button>
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Upcoming appointments card ────────────────────────────────────────────────
function UpcomingAppointmentsCard({ events }: { events: CalendarEvent[] }) {
  const upcoming = events.slice(0, 5);
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-head">
        <div>
          <h3>Upcoming appointments</h3>
          <p className="card-sub">Confirmed bookings · shadow calendar</p>
        </div>
        <Link href="/calendar">
          <button className="btn btn-sm btn-ghost">Calendar <Icon name="arrow" size={11} /></button>
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--relay-ink-3)', fontSize: 13 }}>
          No upcoming bookings yet
        </div>
      ) : (
        <div className="stack-tight" style={{ gap: 0 }}>
          {upcoming.map((ev, i) => (
            <div
              key={ev.referralId}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 0',
                borderBottom: i < upcoming.length - 1 ? '1px dashed var(--relay-hairline)' : 'none',
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: 'var(--relay-accent-50)', border: '1px solid var(--relay-accent-200)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <Icon name="cal" size={15} style={{ color: 'var(--relay-accent-700)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{ev.patient}</div>
                <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
                  {ev.day} · {ev.time} · {ev.provider}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <StatePill state={ev.state} />
                {ev.mirrorStatus === 'mirrored' && (
                  <span style={{ fontSize: 10.5, color: 'var(--relay-ink-4)' }}>mirrored ✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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

// ── Quick stats card ──────────────────────────────────────────────────────────
function QuickStatsCard({ pipeline, outreachCount }: { pipeline: PipelineCount[]; outreachCount: number }) {
  const active = pipeline.filter(p => p.state !== 'Booked').reduce((a, b) => a + b.count, 0);
  const pending = pipeline.find(p => p.state === 'Pending Confirmation')?.count ?? 0;
  const confirmed = pipeline.find(p => p.state === 'Booked')?.count ?? 0;

  const stats = [
    { label: 'Referrals active', value: active },
    { label: 'Texts sent', value: outreachCount },
    { label: 'Slots pending', value: pending },
    { label: 'Confirmed', value: confirmed },
  ];

  return (
    <div className="card" style={{ flex: 'none', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--relay-ink)', lineHeight: 1.1 }}>{s.value}</span>
            <span style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useSession();
  const [queue, setQueue]                   = useState<ConfirmQueue>({ escalations: [], needsHuman: [], slots: [] });
  const [pipeline, setPipeline]             = useState<PipelineCount[]>([]);
  const [referrals, setReferrals]           = useState<Referral[]>([]);
  const [outreachLog, setOutreachLog]       = useState<OutreachLogEntry[]>([]);
  const [calEvents, setCalEvents]           = useState<CalendarEvent[]>([]);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);

  const fetchAll = useCallback(() => {
    Promise.all([
      getConfirmQueue(),
      getPipeline(),
      getReferrals(),
      getOutreachLog(),
      getCalendarEvents(),
    ]).then(([q, p, r, ol, ce]) => {
      setQueue(q);
      setPipeline(p);
      setReferrals(r);
      setOutreachLog(ol);
      setCalEvents(ce);
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
      >
        <Link href="/action">
          <button className="btn btn-sm btn-primary"><Icon name="check" size={12} /> Open confirm queue</button>
        </Link>
      </PageHead>

      <ScheduleFreshnessBanner />
      <WorkListStrips escalations={queue.escalations.length} needsHuman={queue.needsHuman.length} />

      <div className="stack">
        {/* Row 1 — slots to confirm + stats card + recent texting outreach */}
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ flex: 'none' }}>
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
              <div style={{ maxHeight: 208, overflowY: 'auto' }}>
                <ActionQueueList items={slots} compact onConfirmed={handleConfirmed} />
              </div>
            </div>
            <QuickStatsCard pipeline={pipeline} outreachCount={outreachLog.length} />
          </div>
          <OutreachLogCard entries={outreachLog} />
        </div>

        {/* Row 2 — recent referrals */}
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

        {/* Row 3 — upcoming appointments */}
        <UpcomingAppointmentsCard events={calEvents} />
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
