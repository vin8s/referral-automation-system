'use client';

import { useState } from 'react';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { TextingSettings } from '@/components/screens/settings/TextingSettings';

const SECTIONS = [
  { id: 'texting',    label: 'Texting (SMS)',           icon: 'sms' },
  { id: 'quiet',     label: 'Compliance & retention',   icon: 'shield' },
  { id: 'escalation', label: 'Escalation rules',        icon: 'alert' },
  { id: 'practice',  label: 'Practice profile',         icon: 'map' },
];

function FakeInput({ value, w = 90 }: { value: string; w?: number }) {
  return (
    <input
      readOnly
      defaultValue={value}
      style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 6, padding: '5px 9px', font: 'inherit', fontSize: 13, width: w, color: 'var(--relay-ink)' }}
    />
  );
}

function SettingRow({ label, sub, control }: { label: string; sub?: string; control: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--relay-hairline)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

function QuietSettings() {
  return (
    <div className="card">
      <h3>Compliance &amp; retention</h3>
      <p className="card-sub" style={{ marginTop: 2 }}>Quiet hours, allowed days and cadence are set under Texting (SMS).</p>
      <SettingRow label="Opt-out keywords" sub="Triggers an immediate stop + audit log entry" control={<FakeInput value="STOP, QUIT, END" w={160} />} />
      <SettingRow label="Condition in texts" sub="Minimum-disclosure rule — clinic name + phone only, never the reason for referral" control={<FakeInput value="Locked on" />} />
      <SettingRow label="Message retention" control={<FakeInput value="2 years" />} />
    </div>
  );
}

function EscalationSettings() {
  const triggers = [
    { label: 'Clinical / distress signal detected', on: true },
    { label: 'Patient explicitly asks for human', on: true },
    { label: 'Cost question beyond published estimate', on: true },
    { label: 'No reply after the final outreach text', on: true },
    { label: 'Wrong number / not the patient', on: true },
    { label: 'Cadence exhausted without resolution', on: false },
  ];
  return (
    <div className="card">
      <h3>What triggers a human</h3>
      <div className="stack-tight" style={{ marginTop: 8 }}>
        {triggers.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px dashed var(--relay-hairline)' }}>
            <Icon name="alert" size={14} />
            <span style={{ fontSize: 13 }}>{e.label}</span>
            <span style={{ flex: 1 }} />
            <span style={{
              fontSize: 11.5, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
              background: e.on ? 'var(--st-won-bg)' : 'var(--st-lost-bg)',
              color: e.on ? 'var(--st-won-fg)' : 'var(--st-lost-fg)',
            }}>
              {e.on ? 'On' : 'Off'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PracticeSettings() {
  return (
    <div className="card">
      <h3>Practice profile</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Name</div>
          <FakeInput value="Rhode Island Free Clinic" w={220} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Specialty</div>
          <FakeInput value="Primary care (free clinic)" w={220} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Locations</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <span className="tag">Mission Bay</span>
            <span className="tag">Daly City</span>
            <span className="tag">+ Add</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Providers</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <span className="tag">Dr. Park</span>
            <span className="tag">Dr. Aoki</span>
            <span className="tag">Dr. Reyes</span>
            <span className="tag">+ Add</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const PANEL: Record<string, React.ReactNode> = {
  texting: <TextingSettings />,
  quiet: <QuietSettings />,
  escalation: <EscalationSettings />,
  practice: <PracticeSettings />,
};

export default function SettingsPage() {
  const [section, setSection] = useState('texting');

  return (
    <>
      <PageHead title="Settings" sub="Configure texting, compliance and practice preferences.">
        <button className="btn btn-sm">Audit log</button>
      </PageHead>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '0 0 240px', padding: 8 }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`nav-item${section === s.id ? ' active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <Icon name={s.icon} size={14} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="stack" style={{ flex: 1 }}>
          {PANEL[section]}
        </div>
      </div>
    </>
  );
}
