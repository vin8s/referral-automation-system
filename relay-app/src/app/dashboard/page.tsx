'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  getConfirmQueue, getPipeline, getReferrals,
  getUrgentAlerts,
  getCallLog, getCalendarEvents,
} from '@/lib/data';
import { PageHead } from '@/components/layout/PageHead';
import { StatePill } from '@/components/shared/StatePill';
import { Funnel } from '@/components/shared/Funnel';
import { Icon } from '@/components/shared/Icon';
import { ActionQueueList } from '@/components/screens/dashboard/ActionQueueList';
import type {
  ConfirmQueueItem, PipelineCount, Referral,
  CallLogEntry, CalendarEvent, UrgentAlert, DashboardFunnelStep,
} from '@/lib/types';

// ── Escalation popover ────────────────────────────────────────────────────────
function EscalationPopover({ alerts }: { alerts: UrgentAlert[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (alerts.length === 0) return null;

  const severityLabel = (s: string) =>
    s === 'high' ? 'High' : s === 'med' ? 'Medium' : 'Low';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn btn-sm"
        style={{
          background: 'var(--relay-urgent-50)',
          color: 'var(--relay-urgent-700)',
          borderColor: 'var(--relay-urgent-200)',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--relay-urgent)',
          display: 'inline-block', flexShrink: 0,
        }} />
        {alerts.length} escalation{alerts.length !== 1 ? 's' : ''} need{alerts.length === 1 ? 's' : ''} a human
        <Icon name="chevron" size={11} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 360, background: 'var(--relay-surface)',
          border: '1px solid var(--relay-hairline)',
          borderRadius: 10, boxShadow: 'var(--relay-shadow-pop)',
          zIndex: 200,
        }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--relay-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Active escalations</div>
              <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', marginTop: 1 }}>
                {alerts.length} active · SLA 5 min
              </div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
              <Icon name="x" size={12} />
            </button>
          </div>

          {/* Alert list */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {alerts.map(alert => (
              <div
                key={alert.referralId}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--relay-hairline)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    padding: '1px 7px', borderRadius: 99,
                    background: 'var(--st-escalated-bg)', color: 'var(--st-escalated-fg)',
                  }}>
                    {severityLabel(alert.severity)}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{alert.raisedAt}</span>
                  {alert.owner && (
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
                      → {alert.owner}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>{alert.patient}</div>
                <div style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', marginBottom: alert.transcriptExcerpt.length > 0 ? 6 : 0 }}>
                  {alert.reason}
                </div>
                {alert.transcriptExcerpt.length > 0 && (
                  <div style={{
                    fontSize: 12, color: 'var(--relay-ink-3)', fontStyle: 'italic',
                    background: 'var(--relay-tint)', borderRadius: 5,
                    padding: '6px 8px', borderLeft: '2px solid var(--relay-urgent-200)',
                    lineHeight: 1.4,
                  }}>
                    &ldquo;{alert.transcriptExcerpt[alert.transcriptExcerpt.length - 1]?.text}&rdquo;
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 16px' }}>
            <Link href="/alerts" style={{ display: 'block' }}>
              <button
                className="btn btn-sm btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setOpen(false)}
              >
                Open escalation queue <Icon name="arrow" size={12} />
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI call log card ──────────────────────────────────────────────────────────
const OUTCOME_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  'No Answer':            { bg: 'var(--relay-tint)',       fg: 'var(--relay-ink-3)',      label: 'No answer'   },
  'Voicemail Left':       { bg: 'var(--st-queued-bg)',     fg: 'var(--st-queued-fg)',     label: 'Voicemail'   },
  'Call Back Requested':  { bg: 'var(--st-outreach-bg)',  fg: 'var(--st-outreach-fg)',   label: 'Call back'   },
  'Identity Verified':    { bg: 'var(--st-queued-bg)',     fg: 'var(--st-queued-fg)',     label: 'ID verified' },
  'Interested':           { bg: 'var(--st-outreach-bg)',  fg: 'var(--st-outreach-fg)',   label: 'Interested'  },
  'Appointment Accepted': { bg: 'var(--st-accepted-bg)',  fg: 'var(--st-accepted-fg)',   label: 'Accepted'    },
  'Booked':               { bg: 'var(--st-booked-bg)',    fg: 'var(--st-booked-fg)',     label: 'Booked'      },
  'Transferred to Staff': { bg: 'var(--st-outreach-bg)', fg: 'var(--st-outreach-fg)',   label: 'Transferred' },
  'Declined Referral':    { bg: 'var(--st-lost-bg)',      fg: 'var(--st-lost-fg)',       label: 'Declined'    },
  'Wrong Number':         { bg: 'var(--st-lost-bg)',      fg: 'var(--st-lost-fg)',       label: 'Wrong #'     },
  'Language Barrier':     { bg: 'var(--st-escalated-bg)', fg: 'var(--st-escalated-fg)', label: 'Lang barrier'},
  'Disconnected':         { bg: 'var(--st-lost-bg)',      fg: 'var(--st-lost-fg)',       label: 'Disconnected'},
  'Escalated':            { bg: 'var(--st-escalated-bg)', fg: 'var(--st-escalated-fg)', label: 'Escalated'   },
};

function AICallLogCard({ entries }: { entries: CallLogEntry[] }) {
  const recent = entries.slice(0, 7);
  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="card-head">
        <div>
          <h3>AI call log</h3>
          <p className="card-sub">Most recent attempts</p>
        </div>
        <Link href="/calls">
          <button className="btn btn-sm btn-ghost">View all <Icon name="arrow" size={11} /></button>
        </Link>
      </div>
      <div className="stack-tight" style={{ gap: 0 }}>
        {recent.map((entry, i) => {
          const style = OUTCOME_STYLE[entry.outcome] ?? OUTCOME_STYLE['No Answer'];
          return (
            <div
              key={`${entry.referralId}-${entry.attempt}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderBottom: i < recent.length - 1 ? '1px solid var(--relay-hairline)' : 'none',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)',
                display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--relay-ink-3)',
              }}>
                <Icon name={entry.channel === 'sms' ? 'sms' : 'phone'} size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.patient}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
                  {entry.timestamp} · {entry.duration !== '—' ? entry.duration : '—'}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 500,
                padding: '2px 7px', borderRadius: 99,
                background: style.bg, color: style.fg, flexShrink: 0,
              }}>
                {style.label}
              </span>
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
function RecentReferralsTable({ rows }: { rows: Referral[] }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Patient</th><th>Reason</th><th>Referring</th><th>Received</th><th>State</th><th />
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className={`row-clickable${r.priority === 'urgent' ? ' pri-urgent' : ''}`}>
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
            <td>
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

// ── Pipeline funnel card ──────────────────────────────────────────────────────
function PipelineFunnelCard({ steps }: { steps: DashboardFunnelStep[] }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-head">
        <div>
          <h3>Today&apos;s referral pipeline</h3>
          <p className="card-sub">Funnel for referrals touched in the last 24h</p>
        </div>
        <button className="btn btn-sm btn-ghost">7-day view <Icon name="chevron" size={12} /></button>
      </div>
      <Funnel steps={steps} />
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [queue, setQueue]         = useState<ConfirmQueueItem[]>([]);
  const [pipeline, setPipeline]   = useState<PipelineCount[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [callLog, setCallLog]     = useState<CallLogEntry[]>([]);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [alerts, setAlerts]       = useState<UrgentAlert[]>([]);

  const fetchAll = useCallback(() => {
    Promise.all([
      getConfirmQueue(),
      getPipeline(),
      getReferrals(),
      getCallLog(),
      getCalendarEvents(),
      getUrgentAlerts(),
    ]).then(([q, p, r, cl, ce, al]) => {
      setQueue(q);
      setPipeline(p);
      setReferrals(r);
      setCallLog(cl);
      setCalEvents(ce);
      setAlerts(al);
    });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Called by ActionQueueList after a confirm/reject so the whole page reflects
  // the updated referral state from the data layer.
  const handleConfirmed = useCallback(() => { fetchAll(); }, [fetchAll]);

  const inMotion = pipeline.reduce((a, b) => a + b.count, 0);

  return (
    <>
      <PageHead
        title="Good morning, Priya"
        sub={`Today is Apr 14 · ${inMotion || '—'} referrals in motion`}
      >
        <EscalationPopover alerts={alerts} />
        <button className="btn btn-sm btn-ghost" onClick={fetchAll}>
          <Icon name="refresh" size={13} />
        </button>
      </PageHead>

      <div className="stack">
        {/* Row 1 — action queue + AI call log */}
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div className="card" style={{ flex: 2 }}>
            <div className="card-head">
              <div>
                <h3>Needs your action</h3>
                <p className="card-sub">AI-captured slots awaiting confirmation in your practice system</p>
              </div>
              {queue.length > 0 && (
                <span style={{
                  fontSize: 11.5, padding: '2px 9px', borderRadius: 99, fontWeight: 500,
                  background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)',
                }}>
                  {queue.length} pending
                </span>
              )}
            </div>
            <ActionQueueList items={queue} compact onConfirmed={handleConfirmed} />
          </div>
          <AICallLogCard entries={callLog} />
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
          <RecentReferralsTable rows={referrals.slice(0, 8)} />
        </div>

        {/* Row 3 — upcoming appointments */}
        <UpcomingAppointmentsCard events={calEvents} />
      </div>
    </>
  );
}
