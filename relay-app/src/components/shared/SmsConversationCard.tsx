'use client';

// Referral detail → "Text messages" card: SMS thread, consent / opt-out status,
// per-referral channel preference + pause, open amber items, staff "Send text",
// and (SMS_PROVIDER=mock only) the "Patient simulator (prototype)".

import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { SmsThread } from './SmsThread';
import { NeedsHumanList, NeedsHumanPill } from './NeedsHumanList';
import {
  getSmsThread, sendSmsText, simulatePatientReply, updateSmsPreferences,
} from '@/lib/data';
import type { SmsChannelPreference, SmsThread as Thread } from '@/lib/types';

const pill = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '2px 9px',
  borderRadius: 99, background: bg, color: fg, whiteSpace: 'nowrap',
});

const inputStyle: React.CSSProperties = {
  flex: 1, fontSize: 13, padding: '7px 10px', border: '1px solid var(--relay-hairline)', borderRadius: 6,
  background: 'var(--relay-surface)', color: 'var(--relay-ink)', fontFamily: 'inherit', outline: 'none', resize: 'vertical',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, color: 'var(--relay-ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{children}</span>
    </div>
  );
}

const PAUSE_REASON: Record<string, string> = {
  staff: 'paused by staff', opted_out: 'patient opted out',
};
function pauseLabel(reason: string | null): string {
  if (!reason) return 'paused';
  if (reason.startsWith('red:')) return 'paused — escalated';
  if (reason.startsWith('amber:')) return `paused — ${reason.slice(6).replaceAll('_', ' ')}`;
  return PAUSE_REASON[reason] ?? 'paused';
}

export function SmsConversationCard({
  referralId, dateOfBirth, onReferralChanged,
}: { referralId: string; dateOfBirth: string; onReferralChanged?: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [simDraft, setSimDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setThread(await getSmsThread(referralId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load texts');
    }
  }, [referralId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function run(action: () => Promise<{ success: boolean; errorMsg?: string; status?: string; outcome?: string }>, ok?: (r: { status?: string; outcome?: string }) => string | null) {
    setBusy(true);
    setNotice(null);
    const r = await action();
    setBusy(false);
    if (!r.success) setNotice(r.errorMsg ?? 'Something went wrong.');
    else setNotice(ok?.(r) ?? null);
    await load();
    onReferralChanged?.();
    return r.success;
  }

  if (error) return <div className="card"><h3>Text messages</h3><div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>{error}</div></div>;
  if (!thread) return <div className="card"><h3>Text messages</h3><div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>Loading…</div></div>;

  const c = thread.conversation;
  const k = thread.consent;
  const canText = k.consent && !k.optedOut && !c.numberSuppressed && !thread.textingPaused;
  const blockedWhy = thread.textingPaused ? 'All texting is paused in Settings.'
    : k.optedOut ? 'Patient opted out of texts — call instead.'
    : !k.consent ? 'No SMS consent on file.'
    : c.numberSuppressed ? 'Number reported as a wrong number.' : null;

  const sendStaff = async () => {
    const body = draft.trim();
    if (!body) return;
    if (await run(() => sendSmsText(referralId, body), r => (r.status === 'held' ? 'Quiet hours: the text is held and goes out at the next allowed time.' : null))) setDraft('');
  };
  const simulate = async (body: string) => {
    if (!body.trim()) return;
    if (await run(() => simulatePatientReply(referralId, body), r => (r.outcome ? `Simulated reply processed: ${r.outcome}` : null))) setSimDraft('');
  };

  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="sms" size={14} /> Text messages</h3>
          <p className="card-sub" style={{ marginTop: 3 }}>
            AI texting assistant · nothing is booked until an MA confirms
            {thread.provider === 'mock' && ' · prototype: texts are recorded, not sent'}
            {thread.provider === 'twilio' && ' · Twilio test mode: only approved test phones receive texts'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {k.optedOut
            ? <span style={pill('var(--st-lost-bg)', 'var(--st-lost-fg)')} title={`${k.optOutSource ?? ''} · ${k.optedOutAt ?? ''}`}><Icon name="x" size={10} /> Opted out</span>
            : k.consent
              ? <span style={pill('var(--st-won-bg)', 'var(--st-won-fg)')} title={`${k.consentSource ?? ''} · ${k.consentAt ?? ''}`}><Icon name="check" size={10} /> SMS consent</span>
              : <span style={pill('var(--st-lost-bg)', 'var(--st-lost-fg)')}>No SMS consent</span>}
          {thread.needsHuman.length > 0 && <NeedsHumanPill />}
          {thread.textingPaused && <span style={pill('var(--relay-urgent-100)', 'var(--relay-urgent-700)')}><Icon name="pause" size={10} /> All texting paused</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
        <Fact label="Identity">{c.identityVerified ? 'Verified (DOB)' : c.identityAttempts ? `Not verified · ${c.identityAttempts}/2 tries` : 'Not verified'}</Fact>
        <Fact label="Language">{c.language === 'es' ? 'Spanish' : c.language === 'en' ? 'English' : 'Not supported'}</Fact>
        <Fact label="Outreach texts">{c.outreachCount} of {c.lifetimeCap}{c.exhausted ? ' · exhausted' : ''}</Fact>
        <Fact label="Next text">{c.paused ? pauseLabel(c.pausedReason) : c.nextStep ? c.nextStep.replaceAll('_', ' ') : '—'}</Fact>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
          Automated texts
          <select
            className="select-sm" style={{ width: 'auto' }} value={c.channelPreference} disabled={busy}
            onChange={e => run(() => updateSmsPreferences(referralId, { channelPreference: e.target.value as SmsChannelPreference }))}
          >
            <option value="sms">On</option>
            <option value="none">Off (staff contact only)</option>
          </select>
        </label>
        <button className="btn btn-sm" disabled={busy} onClick={() => run(() => updateSmsPreferences(referralId, { paused: !c.paused }))}>
          <Icon name={c.paused ? 'play' : 'pause'} size={11} /> {c.paused ? 'Resume texting' : 'Pause texting'}
        </button>
        {!k.consent || k.optedOut ? (
          <button
            className="btn btn-sm" disabled={busy}
            title="Only after the patient gave written or verbal consent (PATIENT_CONSENT.md)"
            onClick={() => run(() => updateSmsPreferences(referralId, { consent: true, consentSource: 'verbal, recorded by staff' }))}
          >
            <Icon name="check" size={11} /> Record SMS consent
          </button>
        ) : (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run(() => updateSmsPreferences(referralId, { consent: false }))}>
            Remove consent
          </button>
        )}
      </div>

      {thread.needsHuman.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <NeedsHumanList items={thread.needsHuman} onResolved={() => { load(); }} />
        </div>
      )}

      <SmsThread messages={thread.messages} emptyText="No texts yet. The outreach scheduler sends the first text when this referral is due." />

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          rows={2} value={draft} onChange={e => setDraft(e.target.value)} disabled={!canText || busy}
          placeholder={blockedWhy ?? 'Write a text to the patient… (no medical details, no links)'}
          style={inputStyle} aria-label="Text to patient"
        />
        <button className="btn btn-sm btn-primary" disabled={!canText || busy || !draft.trim()} onClick={sendStaff}>
          <Icon name="sms" size={11} /> Send text
        </button>
      </div>
      {notice && <div role="status" style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 6 }}>{notice}</div>}

      {thread.simulatorEnabled && (
        <div style={{ marginTop: 16, padding: 12, border: '1px dashed var(--relay-hairline-strong)', borderRadius: 8, background: 'var(--relay-tint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--relay-ink-2)' }}>Patient simulator (prototype)</span>
            <span style={{ fontSize: 11, color: 'var(--relay-ink-4)' }}>SMS_PROVIDER=mock · fake replies only · runs the real inbound flow</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {[dateOfBirth, '1', '2', 'who is this?', 'how much will it cost?', 'STOP', 'HELP', "I can't breathe"].filter(Boolean).map(q => (
              <button key={q} className="tag" style={{ cursor: 'pointer' }} disabled={busy} onClick={() => simulate(q)}>{q}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={simDraft} onChange={e => setSimDraft(e.target.value)} disabled={busy}
              onKeyDown={e => { if (e.key === 'Enter') simulate(simDraft); }}
              placeholder="Type a reply as the patient…" style={inputStyle} aria-label="Simulated patient reply"
            />
            <button className="btn btn-sm" disabled={busy || !simDraft.trim()} onClick={() => simulate(simDraft)}>
              Send as patient
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
