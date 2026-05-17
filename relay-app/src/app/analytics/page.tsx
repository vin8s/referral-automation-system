import { PageHead } from '@/components/layout/PageHead';
import { Funnel } from '@/components/shared/Funnel';
import { MetricCard } from '@/components/shared/MetricCard';
import { Icon } from '@/components/shared/Icon';
import { getAnalytics } from '@/lib/data';

function ComplianceTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: 12, background: 'var(--relay-tint)', borderRadius: 6, border: '1px solid var(--relay-hairline)' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--relay-ink-3)' }}>{label}</div>
      <div className="fw-6 tnum" style={{ fontSize: 17, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>{sub}</div>
    </div>
  );
}

function LeakBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
      <span style={{ width: 200, flexShrink: 0, color: 'var(--relay-ink-2)' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--relay-tint)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 3}%`, height: '100%', background: 'var(--relay-urgent)' }} />
      </div>
      <span className="tnum fw-6" style={{ width: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function FidelityGauge({ value }: { value: number }) {
  const size = 110, stroke = 10;
  const r = (size - stroke) / 2;
  const c = Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size / 2 + 12 }}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path
          d={`M${stroke / 2},${size / 2} A${r},${r} 0 0 1 ${size - stroke / 2},${size / 2}`}
          fill="none" stroke="var(--relay-ink-5)" strokeWidth={stroke} strokeLinecap="round"
        />
        <path
          d={`M${stroke / 2},${size / 2} A${r},${r} 0 0 1 ${size - stroke / 2},${size / 2}`}
          fill="none" stroke="var(--relay-accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div style={{ position: 'absolute', top: 24, left: 0, right: 0, textAlign: 'center' }}>
        <div className="fw-6 tnum" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>{value}%</div>
        <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>fidelity</div>
      </div>
    </div>
  );
}

function Placeholder({ label, height }: { label: string; height: number }) {
  return (
    <div className="ph-chart" style={{ height }}>{label}</div>
  );
}

export default async function AnalyticsPage() {
  const analytics = await getAnalytics();

  return (
    <>
      <PageHead
        title="Analytics"
        sub="Strategic ROI view · Quarter to date · Apr 1 – Apr 14"
      >
        <button className="btn btn-sm"><Icon name="cal" size={12} /> QTD <Icon name="chevron" size={12} /></button>
        <button className="btn btn-sm"><Icon name="download" size={12} /> Export PDF</button>
      </PageHead>

      <div className="stack">
        {/* KPI metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard label="Recovered revenue" value={`$${(analytics.recoveredRevenue.amount / 1000).toFixed(0)}k`} delta="+$162k vs. baseline" deltaDir="up" spark={[210,260,290,340,360,400,440,486]} />
          <MetricCard label="Conversion rate" value={`${analytics.conversionLift.currentPct}%`} delta="+10pp vs. baseline" deltaDir="up" spark={[28,29,31,33,34,35,37,38]} />
          <MetricCard label="Backlog re-activated" value={String(analytics.backlogReactivation.recoveredVisits)} delta="visits completed" deltaDir="up" spark={[0,8,28,62,108,142,178,203]} />
          <MetricCard label="Shadow fidelity" value={`${analytics.shadowFidelity.currentPct}%`} delta="migration-ready" deltaDir="up" spark={[98,98.5,99,99.2,99.3,99.4,99.4,99.4]} />
        </div>

        {/* Funnel hero */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Conversion funnel — quarter to date</h3>
              <p className="card-sub">Counts and lift vs. pre-Relay baseline</p>
            </div>
            <span style={{ fontSize: 11.5, background: 'var(--st-won-bg)', color: 'var(--st-won-fg)', padding: '2px 9px', borderRadius: 99, fontWeight: 500 }}>
              +34% lift overall
            </span>
          </div>
          <Funnel steps={[
            { label: 'Referrals received', n: 1284, conv: null },
            { label: 'Contacted', n: 1162, conv: 91 },
            { label: 'Pending Confirmation', n: 612, conv: 53 },
            { label: 'Confirmed', n: 547, conv: 89 },
            { label: 'Visit completed', n: 482, conv: 88 },
          ]} />
          <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Baseline (Q1 — pre-Relay): <span className="fw-6" style={{ color: 'var(--relay-ink-2)' }}>28% conversion</span></span>
            <span>This quarter: <span className="fw-6" style={{ color: 'var(--relay-accent-700)' }}>38% conversion</span></span>
            <span>Previously dormant patients reached: <span className="fw-6" style={{ color: 'var(--relay-ink-2)' }}>203</span></span>
          </div>
        </div>

        {/* Revenue + backlog */}
        <div className="row">
          <div className="relay-card metric" style={{ flex: 1, background: 'var(--relay-accent-50)', borderColor: 'var(--relay-accent-200)' }}>
            <div className="metric-label" style={{ color: 'var(--relay-accent-700)' }}>Recovered revenue</div>
            <div className="metric-value" style={{ fontSize: 36, color: 'var(--relay-accent-800)' }}>${(analytics.recoveredRevenue.amount / 1000).toFixed(0)}k</div>
            <div style={{ fontSize: 12, color: 'var(--relay-ink-2)', marginTop: 4 }}>
              est., based on practice avg. visit value $1,008 × 482 completed
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>From converted referrals</div>
                <div className="fw-6 tnum">$281,400</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>From backlog re-activation</div>
                <div className="fw-6 tnum">$204,800</div>
              </div>
            </div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-head">
              <h3>Backlog re-activation — first 14 days</h3>
              <span style={{ fontSize: 11.5, background: 'var(--st-won-bg)', color: 'var(--st-won-fg)', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>Pilot</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Dead referrals run', value: '2,118', sub: 'from prior 9 months' },
                { label: 'Reached', value: '638', sub: '30% of pool' },
                { label: 'Slots captured', value: '271', sub: '42% of reached' },
                { label: 'Visits completed', value: '203', sub: '$204,800 recovered' },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--relay-ink-3)' }}>{m.label}</div>
                  <div className="tnum" style={{ fontSize: 22, fontWeight: 600, marginTop: 2, letterSpacing: '-0.02em' }}>{m.value}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>{m.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leakage + fidelity */}
        <div className="row">
          <div className="card" style={{ flex: 1.4 }}>
            <div className="card-head">
              <div>
                <h3>Leakage by stage &amp; source</h3>
                <p className="card-sub">Where patients drop, by referring practice</p>
              </div>
              <button className="btn btn-sm btn-ghost"><Icon name="info" size={12} /></button>
            </div>
            <Placeholder label="[ stacked bar chart — leakage by source × stage ]" height={220} />
            <div className="stack-tight" style={{ marginTop: 12, fontSize: 12.5 }}>
              <LeakBar label="Dr. Estrada (PCP) — at contact" pct={21} />
              <LeakBar label="SF General — at slot" pct={14} />
              <LeakBar label="Dr. Chen — at confirm" pct={8} />
              <LeakBar label="Dr. Brooks — at contact" pct={6} />
              <LeakBar label="Dr. Lee — at contact" pct={5} />
            </div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-head">
              <div>
                <h3>Shadow-calendar fidelity</h3>
                <p className="card-sub">Mirror correctness vs. real schedule · migration readiness</p>
              </div>
              <span style={{ fontSize: 11.5, background: 'var(--st-won-bg)', color: 'var(--st-won-fg)', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>Healthy</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <FidelityGauge value={99.4} />
              <div className="stack-tight" style={{ fontSize: 12.5 }}>
                <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Mirror writes</span><span className="fw-6">12,418</span></div>
                <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Conflicts detected</span><span className="fw-6">9</span></div>
                <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Resolved in &lt;15 min</span><span className="fw-6">9 / 9</span></div>
                <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Status</span><span style={{ color: 'var(--relay-accent-700)' }} className="fw-6">Migration-ready</span></div>
              </div>
            </div>
            <Placeholder label="[ 30-day fidelity trend — line ]" height={120} />
          </div>
        </div>

        {/* Compliance snapshot */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Compliance &amp; audit snapshot</h3>
              <p className="card-sub">Last 30 days · exportable</p>
            </div>
            <button className="btn btn-sm">Download CSV <Icon name="download" size={12} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <ComplianceTile label="AI disclosure played" value="100%" sub="11,247 / 11,247" />
            <ComplianceTile label="Quiet hours respected" value="100%" sub="0 violations" />
            <ComplianceTile label="Opt-outs honored" value="48 / 48" sub="median 3s" />
            <ComplianceTile label="PHI on voicemail" value="None" sub="minimum-disclosure rule" />
            <ComplianceTile label="Change attribution" value="100% logged" sub="immutable trail" />
          </div>
        </div>
      </div>
    </>
  );
}
