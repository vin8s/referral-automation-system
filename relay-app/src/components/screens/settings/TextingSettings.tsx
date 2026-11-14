'use client';

// Settings → "Texting (SMS)": the practice-wide kill switch ("Pause all texting"),
// quiet hours, cadence and caps (AGENT_SAFETY_RULES R7). Admin-only writes.

import { useEffect, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { useSession } from '@/contexts/SessionContext';
import { getOutreachSettings, saveOutreachSettings } from '@/lib/data';
import type { OutreachSettings, OutreachSettingsView } from '@/lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const inputStyle: React.CSSProperties = {
  background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 6,
  padding: '5px 9px', font: 'inherit', fontSize: 13, color: 'var(--relay-ink)', outline: 'none',
};

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--relay-hairline)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  );
}

export function TextingSettings() {
  const { isAdmin } = useSession();
  const [view, setView] = useState<OutreachSettingsView | null>(null);
  const [s, setS] = useState<OutreachSettings | null>(null);
  const [cadenceText, setCadenceText] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getOutreachSettings().then(v => { setView(v); setS(v.settings); setCadenceText(v.settings.cadenceDays.join(', ')); });
  }, []);

  if (!view || !s) return <div className="card"><h3>Texting (SMS)</h3><div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>Loading…</div></div>;

  async function save(next: OutreachSettings, note: string) {
    setSaving(true);
    setMsg(null);
    try {
      const v = await saveOutreachSettings(next);
      setView(v); setS(v.settings); setCadenceText(v.settings.cadenceDays.join(', '));
      setMsg({ ok: true, text: note });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  }

  const disabled = !isAdmin || saving;
  const paused = view.settings.textingPaused;

  return (
    <>
      {/* Kill switch — prominent, amber when engaged */}
      <div className="card" style={paused ? { background: 'var(--relay-urgent-50)', borderColor: 'var(--relay-urgent-200)' } : undefined}>
        <div className="between" style={{ gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0,
              background: paused ? 'var(--relay-urgent-100)' : 'var(--relay-accent-50)',
              color: paused ? 'var(--relay-urgent-700)' : 'var(--relay-accent-700)',
            }}>
              <Icon name={paused ? 'pause' : 'sms'} size={16} />
            </div>
            <div>
              <div className="fw-6" style={{ fontSize: 15 }}>{paused ? 'All texting is paused' : 'Texting is on'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 2 }}>
                {paused
                  ? 'No outreach, follow-ups, AI replies or staff texts go out. Inbound texts are still stored and screened; emergency, STOP and HELP replies still send.'
                  : 'Stops all automated texting immediately when paused. Use it if anything looks wrong.'}
              </div>
            </div>
          </div>
          <button
            className={`btn ${paused ? 'btn-primary' : 'btn-danger'}`} disabled={disabled}
            onClick={() => save({ ...s, textingPaused: !paused }, paused ? 'Texting resumed.' : 'All texting paused.')}
          >
            <Icon name={paused ? 'play' : 'pause'} size={13} /> {paused ? 'Resume texting' : 'Pause all texting'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>New referrals</h3></div>
        <Row
          label="Staff approval before the first text (pilot mode)"
          sub={s.approvalRequired
            ? 'On: new referrals wait in Ready to text on the Dashboard until a staff member approves them. Follow-ups after the first text are automatic.'
            : 'Off: referrals with SMS consent get their first text automatically in the next sending window.'}
        >
          <button
            className="btn btn-sm" disabled={disabled}
            style={s.approvalRequired ? { background: 'var(--relay-accent-50)', borderColor: 'var(--relay-accent)', color: 'var(--relay-accent-700)' } : undefined}
            onClick={() => save({ ...s, approvalRequired: !s.approvalRequired }, s.approvalRequired ? 'Pilot mode off: first texts are automatic.' : 'Pilot mode on: staff approve each first text.')}
          >
            {s.approvalRequired ? 'On' : 'Off'}
          </button>
        </Row>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Quiet hours</h3>
          <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Clinic time · {view.timezone}</span>
        </div>
        <Row label="Sending window" sub="Unsolicited texts and non-urgent replies only go out inside this window (8 am–8 pm at most). Emergency, STOP and HELP replies go out at any hour.">
          <input type="time" value={s.quietStart} min="08:00" max="20:00" disabled={disabled} style={inputStyle} onChange={e => setS({ ...s, quietStart: e.target.value })} />
          <span>–</span>
          <input type="time" value={s.quietEnd} min="08:00" max="20:00" disabled={disabled} style={inputStyle} onChange={e => setS({ ...s, quietEnd: e.target.value })} />
        </Row>
        <Row label="Days" sub="Never on Sundays (R7.1)">
          {DAYS.map((d, i) => {
            const on = s.allowedDays.includes(i);
            return (
              <button
                key={d} disabled={disabled || i === 0} className="btn btn-sm"
                style={on ? { background: 'var(--relay-accent-50)', borderColor: 'var(--relay-accent)', color: 'var(--relay-accent-700)' } : undefined}
                onClick={() => setS({ ...s, allowedDays: on ? s.allowedDays.filter(x => x !== i) : [...s.allowedDays, i].sort() })}
              >{d}</button>
            );
          })}
        </Row>
        <Row label="Clinic holidays" sub="No texts on these dates (YYYY-MM-DD, comma separated)">
          <input
            value={s.holidays.join(', ')} disabled={disabled} style={{ ...inputStyle, width: 240 }}
            onChange={e => setS({ ...s, holidays: e.target.value.split(/[\s,]+/).filter(Boolean) })}
          />
        </Row>
      </div>

      <div className="card">
        <div className="card-head"><h3>Cadence &amp; caps</h3></div>
        <Row label="Outreach days" sub="first text → follow-up 1 → follow-up 2 → final text, counted from the first text">
          <input value={cadenceText} disabled={disabled} style={{ ...inputStyle, width: 120 }} onChange={e => setCadenceText(e.target.value)} />
        </Row>
        <Row label="Minimum spacing" sub="Hours between unsolicited texts (and never more than one a day)">
          <input type="number" min={24} max={168} value={s.minSpacingHours} disabled={disabled} style={{ ...inputStyle, width: 70 }} onChange={e => setS({ ...s, minSpacingHours: Number(e.target.value) })} /> h
        </Row>
        <Row label="Lifetime cap per referral" sub="Unsolicited texts in total (6 max — matches the consent form)">
          <input type="number" min={1} max={6} value={s.lifetimeCap} disabled={disabled} style={{ ...inputStyle, width: 70 }} onChange={e => setS({ ...s, lifetimeCap: Number(e.target.value) })} />
        </Row>
        <Row label="Call the patient after" sub="No reply this long after the final text → needs-a-human item">
          <input type="number" min={24} max={336} value={s.exhaustedAfterHours} disabled={disabled} style={{ ...inputStyle, width: 70 }} onChange={e => setS({ ...s, exhaustedAfterHours: Number(e.target.value) })} /> h
        </Row>
        <Row label="AI replies per patient per day" sub="Loop guard (15 max); then a staff member takes over">
          <input type="number" min={1} max={15} value={s.aiDailyCap} disabled={disabled} style={{ ...inputStyle, width: 70 }} onChange={e => setS({ ...s, aiDailyCap: Number(e.target.value) })} />
        </Row>

        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          {!isAdmin && (
            <span style={{ fontSize: 12, color: 'var(--relay-ink-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="shield" size={12} /> Only administrators can change settings
            </span>
          )}
          {msg && (
            <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12.5, color: msg.ok ? 'var(--relay-accent)' : 'var(--relay-urgent-700)' }}>
              {msg.text}
            </span>
          )}
          {view.updatedBy && <span style={{ fontSize: 11.5, color: 'var(--relay-ink-4)' }}>Last saved {view.updatedAt} by {view.updatedBy}</span>}
          <button
            className="btn btn-sm btn-primary" disabled={disabled}
            style={isAdmin ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
            onClick={() => save({ ...s, cadenceDays: cadenceText.split(/[\s,]+/).filter(Boolean).map(Number) }, 'Saved.')}
          >
            {saving ? 'Saving…' : 'Save texting settings'}
          </button>
        </div>
      </div>
    </>
  );
}
