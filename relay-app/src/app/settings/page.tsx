'use client';

import { useState } from 'react';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';

const SECTIONS = [
  { id: 'cadence',    label: 'Cadence policy',          icon: 'history' },
  { id: 'scripts',   label: 'AI scripts & disclosure',  icon: 'transcript' },
  { id: 'quiet',     label: 'Quiet hours & compliance', icon: 'shield' },
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

function CadenceSettings() {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>Attempt schedule</h3>
          <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Standard cadence (non-urgent)</span>
        </div>
        <SettingRow label="Voice attempt #1" sub="Within business hours of ingestion" control={<FakeInput value="Same day" />} />
        <SettingRow label="Voice attempt #2" sub="Different time-of-day if #1 was no-answer" control={<FakeInput value="Day +2" />} />
        <SettingRow label="SMS fallback" sub="After two voicemails / no-answers" control={<FakeInput value="Day +3" />} />
        <SettingRow label="Voice attempt #3" control={<FakeInput value="Day +5" />} />
        <SettingRow label="Stop rule" sub="Mark Closed-lost; re-activatable after 60 days" control={<FakeInput value="5 attempts" w={110} />} />
      </div>
      <div className="card">
        <div className="card-head"><h3>Urgent / high-priority overrides</h3></div>
        <SettingRow label="First attempt SLA" sub="From ingest" control={<FakeInput value="≤ 30 min" />} />
        <SettingRow label="Stop rule" control={<FakeInput value="7 attempts" w={110} />} />
        <SettingRow label="Hand to human if no answer in" control={<FakeInput value="3 attempts" w={110} />} />
      </div>
    </>
  );
}

function ScriptsSettings() {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>Mandatory AI disclosure</h3>
          <span style={{ fontSize: 11.5, background: 'var(--st-lost-bg)', color: 'var(--st-lost-fg)', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>Locked · compliance</span>
        </div>
        <div style={{ padding: 14, background: 'var(--relay-tint)', border: '1px dashed var(--relay-hairline-strong)', borderRadius: 6, fontSize: 13.5, color: 'var(--relay-ink-2)' }}>
          &ldquo;Hi, this is the Relay assistant calling on behalf of [practice name]. I&apos;m an AI helping schedule your cardiology referral.&rdquo;
        </div>
        <p className="card-sub" style={{ marginTop: 10 }}>This phrasing is required by policy and cannot be edited inline. Open the compliance request flow to propose changes.</p>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Friction-resolution branches</h3>
          <button className="btn btn-sm">Add branch</button>
        </div>
        <div className="stack-tight">
          {['Cost / insurance question', 'Why was I referred', 'Wrong number / not the patient',
            'Patient distress / clinical question', 'Transport / can\'t get there', 'Asks for human'].map(b => (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px dashed var(--relay-hairline)' }}>
              <Icon name="transcript" size={14} />
              <span style={{ fontSize: 13 }}>{b}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Active · 3 variants</span>
              <button className="btn btn-sm btn-ghost"><Icon name="edit" size={12} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Language variants</h3></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['English ✓', 'Spanish ✓', 'Vietnamese ✓', 'Portuguese ✓', 'Cantonese', '+ Add'].map(l => (
            <span className="tag" key={l} style={{ padding: '4px 10px', fontSize: 12.5 }}>{l}</span>
          ))}
        </div>
      </div>
    </>
  );
}

function QuietSettings() {
  return (
    <div className="card">
      <h3>Quiet hours &amp; compliance</h3>
      <SettingRow label="Contact window" sub="Outbound voice + SMS limited to these hours" control={<><FakeInput value="8:00 AM" /><span style={{ margin: '0 8px' }}>–</span><FakeInput value="8:00 PM" /></>} />
      <SettingRow label="Sundays" sub="No automated outbound contact" control={<FakeInput value="Disabled" />} />
      <SettingRow label="Opt-out keyword" sub="Triggers immediate cadence stop + log" control={<FakeInput value="STOP, QUIT, END" w={160} />} />
      <SettingRow label="PHI on voicemail" sub="Minimum-disclosure rule — practice + callback number only" control={<FakeInput value="Locked on" />} />
      <SettingRow label="Audio retention" control={<FakeInput value="30 days" />} />
      <SettingRow label="Transcript retention" control={<FakeInput value="2 years" />} />
    </div>
  );
}

function EscalationSettings() {
  const triggers = [
    { label: 'Clinical / distress signal detected', on: true },
    { label: 'Patient explicitly asks for human', on: true },
    { label: 'Cost question beyond published estimate', on: true },
    { label: '3 voicemails + 0 SMS engagement', on: true },
    { label: 'Wrong number / non-patient on the line', on: true },
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
          <FakeInput value="Bay Cardiology Group" w={220} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Specialty</div>
          <FakeInput value="Cardiology" w={220} />
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
  cadence: <CadenceSettings />,
  scripts: <ScriptsSettings />,
  quiet: <QuietSettings />,
  escalation: <EscalationSettings />,
  practice: <PracticeSettings />,
};

export default function SettingsPage() {
  const [section, setSection] = useState('cadence');

  return (
    <>
      <PageHead title="Settings" sub="The supervised-automation story made tangible.">
        <button className="btn btn-sm">Audit log</button>
        <button className="btn btn-sm btn-primary">Save</button>
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
