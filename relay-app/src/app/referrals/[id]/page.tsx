import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getReferralById } from '@/lib/data';
import { StatePill } from '@/components/shared/StatePill';
import { Avatar } from '@/components/shared/Avatar';
import { Icon } from '@/components/shared/Icon';
import { TranscriptPanel } from '@/components/shared/TranscriptPanel';

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ width: 130, flexShrink: 0, fontSize: 12, color: 'var(--relay-ink-3)' }}>{label}</span>
      <span style={{ color: 'var(--relay-ink-2)', fontSize: 13 }}>{value}</span>
    </div>
  );
}

export default async function ReferralDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getReferralById(id);
  if (!r) notFound();

  const lastAttempt = r.attempts[r.attempts.length - 1];

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Link href="/referrals">
          <button className="btn btn-sm btn-ghost">
            ← Referrals
          </button>
        </Link>
        <span style={{ fontSize: 12, color: 'var(--relay-ink-3)', fontVariantNumeric: 'tabular-nums' }}>{r.id}</span>
      </div>

      {/* Page head */}
      <div className="pg-head" style={{ marginBottom: 22, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar name={r.patient.name} size="lg" />
          <div>
            <h1 style={{ fontSize: 22 }}>{r.patient.name}</h1>
            <div className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              {r.patient.age}{r.patient.sex} · {r.patient.language} · {r.patient.insurance}
              <StatePill state={r.state} />
              {r.priority === 'urgent' && (
                <span style={{ fontSize: 11.5, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>
                  Urgent
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="right">
          <button className="btn btn-sm"><Icon name="pause" size={12} /> Pause cadence</button>
          <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' }}>
            <Icon name="flag" size={12} /> Escalate
          </button>
          {r.state === 'Slot accepted' && (
            <Link href="/action">
              <button className="btn btn-sm btn-primary"><Icon name="check" size={12} /> Confirm slot</button>
            </Link>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="row">
        {/* Left: patient facts + next action */}
        <div className="stack" style={{ flex: 1 }}>
          <div className="card">
            <h3>Patient &amp; insurance</h3>
            <div className="stack-tight" style={{ fontSize: 13, marginTop: 6 }}>
              <Fact label="Name" value={r.patient.name} />
              <Fact label="Age / sex" value={`${r.patient.age} · ${r.patient.sex === 'F' ? 'Female' : 'Male'}`} />
              <Fact label="Preferred language" value={r.patient.language} />
              <Fact label="Insurance" value={r.patient.insurance} />
            </div>
            <div className="relay-divider" />
            <h3>Referral facts</h3>
            <div className="stack-tight" style={{ fontSize: 13, marginTop: 6 }}>
              <Fact label="Reason" value={r.reason} />
              <Fact label="Referring provider" value={r.referringProvider} />
              <Fact label="Received" value={r.referralTime} />
              <Fact label="Attempts" value={`${r.attempts.length} (voice + SMS)`} />
            </div>
          </div>

          {r.capturedSlot && (
            <div className="card" style={{ background: 'var(--relay-accent-50)', borderColor: 'var(--relay-accent-200)' }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--relay-accent-700)', fontSize: 11 }}>
                Captured slot — awaiting confirmation
              </div>
              <div className="fw-6" style={{ marginTop: 6, fontSize: 14 }}>
                <Icon name="cal" size={14} /> {r.capturedSlot.day} · {r.capturedSlot.time} · {r.capturedSlot.provider}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--relay-ink-3)' }}>
                Captured {r.capturedSlot.capturedAgoMin}m ago
              </div>
              <div style={{ marginTop: 10 }}>
                <Link href="/action">
                  <button className="btn btn-sm btn-primary"><Icon name="check" size={12} /> Confirm in action queue</button>
                </Link>
              </div>
            </div>
          )}

          {r.bookedAppointment && (
            <div className="card" style={{ background: 'var(--st-booked-bg)', borderColor: 'var(--relay-accent-200)' }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--relay-accent-700)', fontSize: 11 }}>
                Confirmed appointment
              </div>
              <div className="fw-6" style={{ marginTop: 6, fontSize: 14 }}>
                <Icon name="cal" size={14} /> {r.bookedAppointment.day} · {r.bookedAppointment.time} · {r.bookedAppointment.provider}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--relay-ink-3)' }}>
                Confirmed by {r.bookedAppointment.confirmedBy} · {r.bookedAppointment.confirmedAt}
              </div>
            </div>
          )}

          {/* Audit trail */}
          <div className="card">
            <div className="card-head"><h3>Audit trail</h3></div>
            <div className="stack-tight" style={{ fontSize: 12.5 }}>
              {r.audit.map((entry, i) => (
                <div key={i} className="between">
                  <span style={{ color: 'var(--relay-ink-3)' }}>{entry.at}</span>
                  <span>{entry.who} — {entry.what}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: timeline + transcript */}
        <div className="stack" style={{ flex: 1.6 }}>
          {/* Activity timeline */}
          <div className="card">
            <div className="card-head">
              <h3>Activity timeline</h3>
              <button className="btn btn-sm btn-ghost">Export <Icon name="download" size={11} /></button>
            </div>
            <div className="tl">
              {r.attempts.map((attempt, i) => (
                <div className="tl-item" key={i}>
                  <div className="tl-marker">
                    <div className={`tl-dot${attempt.outcome === 'accepted' ? ' done' : ''}`} />
                    {i < r.attempts.length - 1 && <div className="tl-line" />}
                  </div>
                  <div className="tl-body">
                    <div className="tl-title">
                      Attempt #{attempt.n} · {attempt.channel === 'voice' ? 'Voice' : 'SMS'} · {attempt.outcome}
                    </div>
                    <div className="tl-meta">
                      {attempt.timestamp}
                      {attempt.duration && ` · ${attempt.duration}`}
                      {attempt.disclosurePlayed && ' · disclosure played'}
                    </div>
                    {attempt.summary && (
                      <div className="transcript-summary" style={{ marginTop: 8, fontSize: 12.5 }}>
                        {attempt.summary}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Most recent call transcript */}
          {lastAttempt && lastAttempt.transcript.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3>Most recent call · attempt #{lastAttempt.n}</h3>
                <Link href="/calls">
                  <button className="btn btn-sm btn-ghost">All calls <Icon name="arrow" size={11} /></button>
                </Link>
              </div>
              <TranscriptPanel
                data={{
                  patient: r.patient.name,
                  call: `Attempt #${lastAttempt.n} · ${lastAttempt.channel === 'voice' ? 'Voice' : 'SMS'} · ${lastAttempt.duration ?? ''}`,
                  disclosure: lastAttempt.disclosurePlayed,
                  summary: lastAttempt.summary,
                  turns: lastAttempt.transcript,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
