'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { NeedsHumanList } from '@/components/shared/NeedsHumanList';
import { getUrgentAlerts, claimAlert, getNeedsHumanItems } from '@/lib/data';
import type { NeedsHumanItem, UrgentAlert } from '@/lib/types';

function AlertCard({ alert, onClaim }: { alert: UrgentAlert; onClaim: (id: string) => void }) {
  const isClaimed = !!alert.owner;
  return (
    <div className="card" style={{
      // Red = Escalated (safety). Kept distinct from the amber "needs a human" items below.
      borderColor: isClaimed ? 'var(--relay-hairline)' : '#fecaca',
      background: isClaimed ? 'var(--relay-surface)' : '#fef2f2',
      opacity: isClaimed ? 0.85 : 1,
    }}>
      <div className="between" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: isClaimed ? 'var(--relay-tint)' : 'var(--st-escalated-bg)',
            color: 'var(--st-escalated-fg)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <Icon name="alert" size={16} />
          </div>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="fw-6">{alert.reason}</div>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>· {alert.raisedAt}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Patient: <span className="name-link">{alert.patient}</span>
              <span style={{ color: 'var(--relay-ink-3)' }}> · {alert.referralId}</span>
            </div>
            {alert.transcriptExcerpt.length > 0 && (
              <div className="transcript-summary" style={{ marginTop: 10, fontSize: 12.5 }}>
                &ldquo;{alert.transcriptExcerpt[alert.transcriptExcerpt.length - 1]?.text}&rdquo;
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
          {isClaimed ? (
            <>
              <span style={{ fontSize: 11.5, background: 'var(--st-outreach-bg)', color: 'var(--st-outreach-fg)', padding: '2px 9px', borderRadius: 99, fontWeight: 500 }}>
                In progress · {alert.owner}
              </span>
              <button className="btn btn-sm">Reassign</button>
              <Link href={`/referrals/${alert.referralId}`}>
                <button className="btn btn-sm btn-ghost">Open</button>
              </Link>
            </>
          ) : (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => onClaim(alert.referralId)}>
                <Icon name="check" size={12} /> I&apos;ll take it
              </button>
              <button className="btn btn-sm">Reassign</button>
              <Link href={`/referrals/${alert.referralId}`}>
                <button className="btn btn-sm btn-ghost">View transcript</button>
              </Link>
            </>
          )}
          <div style={{ fontSize: 10.5, color: 'var(--relay-ink-4)' }}>prototype</div>
        </div>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<UrgentAlert[]>([]);
  const [needsHuman, setNeedsHuman] = useState<NeedsHumanItem[]>([]);

  useEffect(() => {
    getUrgentAlerts().then(setAlerts);
    getNeedsHumanItems().then(setNeedsHuman);
  }, []);

  async function handleClaim(referralId: string) {
    await claimAlert(referralId, 'Priya N.');
    const updated = await getUrgentAlerts();
    setAlerts(updated);
  }

  const active = alerts.filter(a => !a.owner);
  const claimed = alerts.filter(a => a.owner);

  return (
    <>
      <PageHead
        title="Urgent alerts"
        sub="Red = Escalated (possible emergency, act now). Amber = needs a human (normal work, same business day)."
      >
        <button className="btn btn-sm btn-ghost">All resolved (12)</button>
        <button className="btn btn-sm">SLA settings</button>
      </PageHead>

      <div className="alerts-strip" style={{ marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="alert" size={15} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{active.length} active · {claimed.length} in progress</div>
          <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 2 }}>
            Median time-to-claim today: 4m 12s · SLA target: 5 min
          </div>
        </div>
        <button className="btn btn-sm">Filter by reason <Icon name="chevron" size={12} /></button>
      </div>

      <div className="stack">
        {alerts.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--relay-ink-3)' }}>
            <Icon name="check" size={24} />
            <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14 }}>No active escalations</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>The AI is handling the queue.</div>
          </div>
        )}
        {alerts.map(alert => (
          <AlertCard key={alert.referralId} alert={alert} onClaim={handleClaim} />
        ))}
        <div className="card">
          <div className="card-head">
            <div>
              <h3 style={{ margin: 0 }}>Needs a human</h3>
              <p className="card-sub" style={{ marginTop: 2 }}>
                Raised by the texting assistant. The referral state does not change; texting pauses where noted.
              </p>
            </div>
            <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>{needsHuman.length} open</span>
          </div>
          {needsHuman.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>Nothing waiting.</div>
          ) : (
            <NeedsHumanList
              items={needsHuman}
              showPatient
              onResolved={id => setNeedsHuman(prev => prev.filter(i => i.id !== id))}
            />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px dashed var(--relay-hairline)' }}>
          <span style={{ fontSize: 13, color: 'var(--relay-ink-3)' }}>Resolved today (3)</span>
          <button className="btn btn-sm btn-ghost">Show <Icon name="chevron" size={12} /></button>
        </div>
      </div>
    </>
  );
}
