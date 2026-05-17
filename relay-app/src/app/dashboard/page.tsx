'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getConfirmQueue, getPipeline, getReferrals,
} from '@/lib/data';
import { PageHead } from '@/components/layout/PageHead';
import { StatePill } from '@/components/shared/StatePill';
import { Funnel } from '@/components/shared/Funnel';
import { MetricCard } from '@/components/shared/MetricCard';
import { Icon } from '@/components/shared/Icon';
import { ActionQueueList } from '@/components/screens/dashboard/ActionQueueList';
import type { ConfirmQueueItem, PipelineCount, Referral } from '@/lib/types';

// ── Compact stat ──────────────────────────────────────────────────────────────
function CompactStat({ label, value, delta, dir }: {
  label: string; value: string; delta: string; dir?: 'up' | 'down';
}) {
  const cls = dir === 'up' ? 'delta-up' : dir === 'down' ? 'delta-down' : '';
  return (
    <div className="ai-stat">
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--relay-ink-3)' }}>
        {label}
      </div>
      <div className="tnum" style={{ fontSize: 17, fontWeight: 600, marginTop: 1, letterSpacing: '-0.01em' }}>
        {value}
        <span className={cls} style={{ fontSize: 11, marginLeft: 6, fontWeight: 500 }}>{delta}</span>
      </div>
    </div>
  );
}

// ── Pipeline glance ───────────────────────────────────────────────────────────
function PipelineGlance({ pipeline }: { pipeline: PipelineCount[] }) {
  const statOrder = ['Queued', 'Outreach', 'Slot accepted', 'Booked', 'Escalated', 'Closed-won'];
  const displayed = statOrder.map(s => ({ state: s, count: pipeline.find(p => p.state === s)?.count ?? 0 }));
  const max = Math.max(...displayed.map(s => s.count), 1);
  const total = displayed.reduce((a, b) => a + b.count, 0);
  const stateVarMap: Record<string, string> = {
    'Queued': 'var(--st-queued-fg)', 'Outreach': 'var(--st-outreach-fg)',
    'Slot accepted': 'var(--st-accepted-fg)', 'Booked': 'var(--st-booked-fg)',
    'Escalated': 'var(--st-escalated-fg)', 'Closed-won': 'var(--st-won-fg)',
  };
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-head">
        <div>
          <h3>Pipeline at a glance</h3>
          <p className="card-sub">{total} referrals in motion</p>
        </div>
      </div>
      <div className="stack-tight" style={{ gap: 9 }}>
        {displayed.map(s => (
          <div key={s.state} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 116, flexShrink: 0 }}><StatePill state={s.state} /></span>
            <div style={{ flex: 1, height: 6, background: 'var(--relay-tint)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${(s.count / max) * 100}%`, height: '100%', background: stateVarMap[s.state] ?? 'var(--relay-ink-4)', opacity: 0.55 }} />
            </div>
            <span className="tnum fw-6" style={{ width: 24, textAlign: 'right', fontSize: 13 }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI health panel ───────────────────────────────────────────────────────────
function AICheckPanel() {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>Is the AI working?</h3>
          <p className="card-sub">Live health signals · last 60 min</p>
        </div>
        <span style={{ fontSize: 11.5, background: 'var(--st-booked-bg)', color: 'var(--st-booked-fg)', padding: '2px 9px', borderRadius: 99, fontWeight: 500 }}>
          All systems normal
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'Disclosure played', value: '100% of calls' },
          { label: 'Quiet hours respected', value: '100%' },
          { label: 'Avg time-to-first-attempt', value: '17 min' },
          { label: 'Escalations triggered', value: '1 · within SLA' },
          { label: 'Shadow-calendar fidelity', value: '99.4%', accent: true },
          { label: 'Opt-outs honored', value: '2 / 2' },
        ].map(row => (
          <div key={row.label}>
            <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{row.label}</div>
            <div className="fw-6" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: row.accent ? 'var(--relay-accent-700)' : undefined }}>
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini calendar ─────────────────────────────────────────────────────────────
function CalendarMini() {
  const days = ['Mon 14', 'Tue 15', 'Wed 16', 'Thu 17', 'Fri 18'];
  const times = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM'];
  const appts = [
    { d: 0, t: 0, who: 'Linh P.', accepted: false },
    { d: 0, t: 4, who: 'Helena B.', accepted: false },
    { d: 1, t: 1, who: 'Aisha P.', accepted: false },
    { d: 1, t: 5, who: 'James O.', accepted: true },
    { d: 2, t: 2, who: 'Robert K.', accepted: true },
    { d: 2, t: 6, who: 'Beatriz C.', accepted: false },
    { d: 4, t: 0, who: 'Sofia R.', accepted: false },
  ];
  return (
    <div className="card" style={{ flex: 1.4 }}>
      <div className="card-head" style={{ marginBottom: 10 }}>
        <div><h3>This week&apos;s schedule</h3><p className="card-sub">Apr 14–18 · confirmed + awaiting MA</p></div>
        <Link href="/calendar"><button className="btn btn-sm btn-ghost">Calendar <Icon name="arrow" size={11} /></button></Link>
      </div>
      <div className="mini-cal" style={{ gridTemplateColumns: '38px repeat(5, 1fr)' }}>
        <div className="mc hd" />
        {days.map(d => <div key={d} className="mc hd">{d}</div>)}
        {times.map((t, ti) => (
          <React.Fragment key={`r-${ti}`}>
            <div className="mc tcol">{t}</div>
            {days.map((_, di) => {
              const a = appts.find(x => x.d === di && x.t === ti);
              return (
                <div key={`${ti}-${di}`} className="mc">
                  {a && <div className="mc-appt" style={a.accepted ? { background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)', borderColor: 'var(--st-accepted-fg)' } : undefined}>{a.who}</div>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--relay-accent-100)', border: '1px solid var(--relay-accent-200)', borderRadius: 2 }} />Booked</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--st-accepted-bg)', border: '1px solid var(--st-accepted-fg)', borderRadius: 2 }} />Awaiting MA</span>
      </div>
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
              <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{r.patient.age}{r.patient.sex} · {r.id}</div>
            </td>
            <td style={{ color: 'var(--relay-ink-2)' }}>{r.reason}</td>
            <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{r.referringProvider}</td>
            <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', fontVariantNumeric: 'tabular-nums' }}>{r.referralTime}</td>
            <td><StatePill state={r.state} /></td>
            <td><Link href={`/referrals/${r.id}`}><button className="btn btn-sm btn-ghost"><Icon name="arrow" size={12} /></button></Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Pipeline funnel card ──────────────────────────────────────────────────────
function PipelineFunnelCard() {
  return (
    <div className="card">
      <div className="card-head">
        <div><h3>Today&apos;s referral pipeline</h3><p className="card-sub">Funnel for referrals touched in the last 24h</p></div>
        <button className="btn btn-sm btn-ghost">7-day view <Icon name="chevron" size={12} /></button>
      </div>
      <Funnel steps={[
        { label: 'Ingested', n: 38, conv: null },
        { label: 'Contacted', n: 27, conv: 71 },
        { label: 'Slot accepted', n: 14, conv: 52 },
        { label: 'Confirmed', n: 11, conv: 79 },
        { label: 'Completed', n: 9, conv: 82 },
      ]} />
    </div>
  );
}

// ── Layout: Vitals-first ──────────────────────────────────────────────────────
function VitalsFirst({ queue, pipeline, referrals }: { queue: ConfirmQueueItem[]; pipeline: PipelineCount[]; referrals: Referral[] }) {
  return (
    <div className="stack">
      <div className="card" style={{ padding: '12px 18px' }}>
        <div className="between" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13 }}>
            Today&apos;s call activity
            <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--relay-ink-3)', fontSize: 12 }}>last 24h · vs. typical day</span>
          </h3>
          <button className="btn btn-sm btn-ghost">7-day <Icon name="chevron" size={12} /></button>
        </div>
        <div className="ai-stats">
          <CompactStat label="Calls made" value="142" delta="+18" dir="up" />
          <CompactStat label="Connected" value="61" delta="43% pickup" />
          <CompactStat label="Slots captured" value="14" delta="+4" dir="up" />
          <CompactStat label="Confirmations" value="11" delta="3 in queue" />
          <CompactStat label="No-answers" value="63" delta="−7" dir="down" />
        </div>
      </div>

      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 2 }}>
          <div className="card-head">
            <div><h3>Needs your action</h3><p className="card-sub">AI-captured slots awaiting confirmation in your practice system</p></div>
            {queue.length > 0 && <span style={{ fontSize: 11.5, background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)', padding: '2px 9px', borderRadius: 99, fontWeight: 500 }}>{queue.length} pending</span>}
          </div>
          <ActionQueueList items={queue} compact />
        </div>
        <PipelineGlance pipeline={pipeline} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-head" style={{ padding: '14px 16px 12px', marginBottom: 0, borderBottom: '1px solid var(--relay-hairline)' }}>
          <div><h3>Recent referrals</h3><p className="card-sub">5 most recent · newest first</p></div>
          <Link href="/referrals"><button className="btn btn-sm btn-ghost">View all <Icon name="arrow" size={11} /></button></Link>
        </div>
        <RecentReferralsTable rows={referrals.slice(0, 5)} />
      </div>

      <div className="row">
        <AICheckPanel />
        <CalendarMini />
      </div>

      <PipelineFunnelCard />
    </div>
  );
}

// ── Layout: Action-first ──────────────────────────────────────────────────────
function ActionFirst({ queue, pipeline }: { queue: ConfirmQueueItem[]; pipeline: PipelineCount[] }) {
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 2 }}>
          <div className="card-head">
            <div><h3>Needs your action</h3><p className="card-sub">AI-captured slots awaiting confirmation in your practice system</p></div>
            {queue.length > 0 && <span style={{ fontSize: 11.5, background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)', padding: '2px 9px', borderRadius: 99, fontWeight: 500 }}>{queue.length} pending</span>}
          </div>
          <ActionQueueList items={queue} />
        </div>
        <div className="stack" style={{ flex: 1, gap: 'var(--gap, 12px)' }}>
          <AICheckPanel />
          <CalendarMini />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
        <MetricCard label="Calls made" value="142" delta="+18 vs. typical" deltaDir="up" spark={[80, 92, 88, 110, 98, 120, 134, 142]} />
        <MetricCard label="Calls connected" value="61" delta="43% pickup · steady" spark={[40, 42, 48, 50, 55, 58, 56, 61]} />
        <MetricCard label="Slots captured" value="14" delta="+4 vs. typical" deltaDir="up" spark={[6, 7, 9, 8, 10, 11, 13, 14]} />
        <MetricCard label="Confirmations done" value="11" delta="3 in queue" spark={[4, 5, 7, 8, 8, 9, 10, 11]} />
        <MetricCard label="No-answers" value="63" delta="↓ 7 vs. typical" deltaDir="down" spark={[78, 72, 70, 68, 65, 64, 65, 63]} />
      </div>

      <PipelineFunnelCard />
    </div>
  );
}

// ── Layout: Split rhythm ──────────────────────────────────────────────────────
function SplitRhythm({ queue }: { queue: ConfirmQueueItem[] }) {
  return (
    <div className="stack">
      <div className="row">
        <div className="stack" style={{ flex: 1.6, gap: 12 }}>
          <div className="card">
            <div className="card-head">
              <div><h3>What needs me</h3><p className="card-sub">Your action queue, in priority order</p></div>
              {queue.length > 0 && <span style={{ fontSize: 11.5, background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)', padding: '2px 9px', borderRadius: 99, fontWeight: 500 }}>{queue.length} now</span>}
            </div>
            <ActionQueueList items={queue} />
          </div>
          <PipelineFunnelCard />
        </div>
        <div className="stack" style={{ flex: 1, gap: 12 }}>
          <div className="card">
            <div className="card-head">
              <h3>Is the AI working</h3>
              <span style={{ fontSize: 11.5, background: 'var(--st-booked-bg)', color: 'var(--st-booked-fg)', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>Healthy</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { label: 'Calls today', value: '142', sub: '+18 vs. typical' },
                { label: 'Pickup rate', value: '43%', sub: 'steady' },
                { label: 'Slots captured', value: '14', sub: '+4 vs. typical' },
                { label: 'Confirmations', value: '11', sub: '3 in queue' },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--relay-ink-3)' }}>{m.label}</div>
                  <div className="tnum" style={{ fontSize: 22, fontWeight: 600, marginTop: 2, letterSpacing: '-0.02em' }}>{m.value}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{m.sub}</div>
                </div>
              ))}
            </div>
            <div className="relay-divider" />
            <div className="stack-tight" style={{ fontSize: 13 }}>
              <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Disclosure played</span><span className="fw-6">100%</span></div>
              <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Quiet hours respected</span><span className="fw-6">100%</span></div>
              <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Shadow-calendar fidelity</span><span className="fw-6" style={{ color: 'var(--relay-accent-700)' }}>99.4%</span></div>
              <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Avg time-to-first-attempt</span><span className="fw-6">17 min</span></div>
            </div>
          </div>
          <CalendarMini />
        </div>
      </div>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────
type DashLayout = 'vitals' | 'action' | 'split';

const LAYOUTS: Array<{ value: DashLayout; label: string }> = [
  { value: 'action', label: 'Action-first' },
  { value: 'vitals', label: 'Vitals-first' },
  { value: 'split', label: 'Split rhythm' },
];

export default function DashboardPage() {
  const [layout, setLayout] = useState<DashLayout>('vitals');
  const [queue, setQueue] = useState<ConfirmQueueItem[]>([]);
  const [pipeline, setPipeline] = useState<PipelineCount[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);

  useEffect(() => {
    Promise.all([getConfirmQueue(), getPipeline(), getReferrals()]).then(([q, p, r]) => {
      setQueue(q);
      setPipeline(p);
      setReferrals(r);
    });
  }, []);

  const inMotion = pipeline.filter(p => !['Closed-won', 'Closed-lost'].includes(p.state)).reduce((a, b) => a + b.count, 0);

  return (
    <>
      <PageHead
        title="Good morning, Priya"
        sub={`Today is Apr 14 · ${inMotion || 38} referrals in motion`}
      >
        {/* Layout tabs */}
        <div className="variations">
          {LAYOUTS.map(l => (
            <button
              key={l.value}
              className={`variation-btn${layout === l.value ? ' active' : ''}`}
              onClick={() => setLayout(l.value)}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Escalation notification */}
        <Link href="/alerts">
          <button className="btn btn-sm" style={{ background: 'var(--relay-urgent-50)', color: 'var(--relay-urgent-700)', borderColor: 'var(--relay-urgent-200)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--relay-urgent)', flexShrink: 0, display: 'inline-block' }} />
            1 escalation needs a human
            <Icon name="arrow" size={11} />
          </button>
        </Link>

        <button className="btn btn-sm btn-ghost"><Icon name="refresh" size={13} /></button>
        <button className="btn btn-sm">Today <Icon name="chevron" size={12} /></button>
      </PageHead>

      {layout === 'action' && <ActionFirst queue={queue} pipeline={pipeline} />}
      {layout === 'vitals' && <VitalsFirst queue={queue} pipeline={pipeline} referrals={referrals} />}
      {layout === 'split' && <SplitRhythm queue={queue} />}
    </>
  );
}
