'use client';

import { useState, useEffect } from 'react';
import { PageHead } from '@/components/layout/PageHead';
import { StatePill } from '@/components/shared/StatePill';
import { getReferrals, getCallLog, getPipeline } from '@/lib/data';
import type { ReferralState, CallOutcome } from '@/lib/types';

// ── Colour map (matches StatePill tokens) ─────────────────────────────────────

const STATE_COLORS: Record<ReferralState, string> = {
  Queued:               'var(--st-queued-fg)',
  'In Progress':        'var(--st-outreach-fg)',
  Attempted:            'var(--relay-ink-3)',
  'Pending Confirmation':'var(--st-pending-fg)',
  Booked:               'var(--st-booked-fg)',
  Escalated:            'var(--relay-urgent)',
};

const OUTCOME_ORDER: CallOutcome[] = [
  'Appointment Accepted',
  'Voicemail Left',
  'No Answer',
  'Call Back Requested',
  'Declined Referral',
  'Transferred to Staff',
  'Wrong Number',
  'Language Barrier',
  'Escalated',
  'Disconnected',
  'Booked',
  'Identity Verified',
  'Interested',
];

// ── Small components ──────────────────────────────────────────────────────────

function StatTile({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      padding: '18px 20px',
      border: `1px solid ${accent ? 'var(--relay-accent-200)' : 'var(--relay-hairline)'}`,
      borderRadius: 10,
      background: accent ? 'var(--relay-accent-50)' : 'var(--relay-surface)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent ? 'var(--relay-accent-700)' : 'var(--relay-ink-3)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: accent ? 'var(--relay-accent-800)' : 'var(--relay-ink)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function PipelineBar({ state, count, total }: { state: ReferralState; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 148, flexShrink: 0 }}>
        <StatePill state={state} />
      </div>
      <div style={{ flex: 1, height: 6, background: 'var(--relay-tint)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${pct}%`,
          background: STATE_COLORS[state],
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ width: 28, textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--relay-ink)', fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </span>
      <span style={{ width: 36, textAlign: 'right', fontSize: 11.5, color: 'var(--relay-ink-3)', fontVariantNumeric: 'tabular-nums' }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

function OutcomeRow({ outcome, count, total }: { outcome: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const isPositive = outcome === 'Appointment Accepted' || outcome === 'Booked';
  const isNegative = outcome === 'Escalated' || outcome === 'Wrong Number' || outcome === 'Language Barrier';
  const barColor = isPositive ? 'var(--relay-accent)' : isNegative ? 'var(--relay-urgent)' : 'var(--relay-ink-3)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 180, flexShrink: 0, fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{outcome}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--relay-tint)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: barColor }} />
      </div>
      <span style={{ width: 28, textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--relay-ink)' }}>{count}</span>
      <span style={{ width: 36, textAlign: 'right', fontSize: 11.5, color: 'var(--relay-ink-3)', fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [referrals, setReferrals] = useState<Awaited<ReturnType<typeof getReferrals>>>([]);
  const [callLog, setCallLog] = useState<Awaited<ReturnType<typeof getCallLog>>>([]);
  const [pipeline, setPipeline] = useState<Awaited<ReturnType<typeof getPipeline>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getReferrals(), getCallLog(), getPipeline()]).then(([r, c, p]) => {
      setReferrals(r);
      setCallLog(c);
      setPipeline(p);
      setLoading(false);
    });
  }, []);

  // ── Derived metrics ─────────────────────────────────────────────────────────

  const totalReferrals = referrals.length;
  const booked = referrals.filter(r => r.state === 'Booked').length;
  const escalated = referrals.filter(r => r.state === 'Escalated').length;
  const conversionRate = totalReferrals > 0 ? ((booked / totalReferrals) * 100).toFixed(0) : '0';

  // Revenue recovered: booked appointments × est. avg. cardiology visit value
  const AVG_VISIT_VALUE = 950;
  const recoveredRevenue = booked * AVG_VISIT_VALUE;
  const recoveredRevenueStr = recoveredRevenue >= 1000
    ? `$${(recoveredRevenue / 1000).toFixed(1)}k`
    : `$${recoveredRevenue}`;

  const totalCalls = callLog.length;
  const disclosurePlayed = callLog.filter(c => c.disclosurePlayed).length;
  const disclosureRate = totalCalls > 0 ? ((disclosurePlayed / totalCalls) * 100).toFixed(0) : '—';

  // Average attempts across referrals that have at least one attempt
  const attempted = referrals.filter(r => r.attempts.length > 0);
  const avgAttempts = attempted.length > 0
    ? (attempted.reduce((s, r) => s + r.attempts.length, 0) / attempted.length).toFixed(1)
    : '—';

  // Outcome breakdown
  const outcomeCounts: Partial<Record<CallOutcome, number>> = {};
  for (const c of callLog) {
    outcomeCounts[c.outcome] = (outcomeCounts[c.outcome] ?? 0) + 1;
  }
  const outcomesPresent = OUTCOME_ORDER.filter(o => (outcomeCounts[o] ?? 0) > 0);

  // Language breakdown of referrals
  const langCounts: Record<string, number> = {};
  for (const r of referrals) {
    langCounts[r.patient.language] = (langCounts[r.patient.language] ?? 0) + 1;
  }
  const langs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);

  if (loading) {
    return (
      <>
        <PageHead title="Analytics" sub="Live · derived from current referral data" />
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--relay-ink-3)', fontSize: 13 }}>
          Loading…
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title="Analytics" sub="Live · derived from current referral data" />

      <div className="stack">

        {/* Top stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <StatTile label="Total referrals" value={totalReferrals} sub="all time in system" />
          <StatTile label="Booked" value={`${conversionRate}%`} sub={`${booked} of ${totalReferrals} confirmed`} accent />
          <StatTile label="Revenue recovered" value={recoveredRevenueStr} sub={`est. $${AVG_VISIT_VALUE} avg. visit value`} accent />
          <StatTile label="Avg. attempts to reach" value={avgAttempts} sub="across contacted patients" />
          <StatTile label="Escalated" value={escalated} sub={totalReferrals > 0 ? `${((escalated / totalReferrals) * 100).toFixed(0)}% of referrals` : '—'} />
        </div>

        {/* Pipeline + outcomes side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Pipeline breakdown */}
          <div className="card">
            <div className="card-head">
              <h3>Pipeline breakdown</h3>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>{totalReferrals} total</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {pipeline.map(p => (
                <PipelineBar key={p.state} state={p.state} count={p.count} total={totalReferrals} />
              ))}
            </div>
          </div>

          {/* Call outcome breakdown */}
          <div className="card">
            <div className="card-head">
              <h3>Call outcomes</h3>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>{totalCalls} calls total</span>
            </div>
            {totalCalls === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--relay-ink-3)', padding: '12px 0' }}>No calls logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                {outcomesPresent.map(o => (
                  <OutcomeRow key={o} outcome={o} count={outcomeCounts[o] ?? 0} total={totalCalls} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Compliance + language */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Compliance */}
          <div className="card">
            <div className="card-head">
              <h3>Compliance</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--relay-ink-2)' }}>AI disclosure played</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: totalCalls > 0 && disclosurePlayed === totalCalls ? 'var(--relay-accent)' : 'var(--relay-ink)' }}>
                  {disclosureRate}%
                </span>
              </div>
              <div style={{ height: 1, background: 'var(--relay-hairline)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--relay-ink-2)' }}>Total AI calls made</span>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{totalCalls}</span>
              </div>
              <div style={{ height: 1, background: 'var(--relay-hairline)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--relay-ink-2)' }}>Escalations raised</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: escalated > 0 ? 'var(--relay-urgent)' : 'var(--relay-ink)' }}>{escalated}</span>
              </div>
            </div>
          </div>

          {/* Language breakdown */}
          <div className="card">
            <div className="card-head">
              <h3>Patient languages</h3>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>{totalReferrals} referrals</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {langs.map(([lang, count]) => (
                <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{lang}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--relay-tint)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${(count / totalReferrals) * 100}%`, background: 'var(--relay-accent)' }} />
                  </div>
                  <span style={{ width: 28, textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--relay-ink)' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
