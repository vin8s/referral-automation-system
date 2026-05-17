'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHead } from '@/components/layout/PageHead';
import { StatePill } from '@/components/shared/StatePill';
import { Icon } from '@/components/shared/Icon';
import { TranscriptPanel } from '@/components/shared/TranscriptPanel';
import { getCallLog } from '@/lib/data';
import type { CallLogEntry } from '@/lib/types';

const OUTCOME_STATE: Record<string, string> = {
  'No Answer':            'Queued',
  'Voicemail Left':       'Queued',
  'Call Back Requested':  'In Progress',
  'Identity Verified':    'In Progress',
  'Interested':           'In Progress',
  'Appointment Accepted': 'Pending Confirmation',
  'Booked':               'Booked',
  'Transferred to Staff': 'Pending Confirmation',
  'Declined Referral':    'In Progress',
  'Wrong Number':         'Escalated',
  'Language Barrier':     'Escalated',
  'Disconnected':         'In Progress',
  'Escalated':            'Escalated',
};

function CallDetailModal({ call, onClose }: { call: CallLogEntry; onClose: () => void }) {
  return (
    <div className="modal-shade" onClick={onClose}>
      <div className="relay-modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
        <div className="relay-modal-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>{call.patient}</h3>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>· attempt #{call.attempt ?? '—'}</span>
              {call.escalated && <StatePill state="Escalated" />}
            </div>
            <p className="card-sub">{call.timestamp} · {call.channel === 'voice' ? 'Voice' : 'SMS'} · {call.duration ?? '—'} · {call.language}</p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={13} /></button>
        </div>
        <div className="relay-modal-body">
          {call.channel === 'voice' ? (
            <TranscriptPanel
              data={{
                patient: call.patient,
                call: `${call.referralId} · Attempt #${call.attempt} · Voice · ${call.duration ?? ''}`,
                disclosure: call.disclosurePlayed,
                summary: call.summary,
                turns: [],
              }}
            />
          ) : (
            <div className="transcript">
              <div className="transcript-summary"><span className="fw-6">AI summary · </span>{call.summary}</div>
            </div>
          )}
          <div className="relay-divider" />
          <div className="stack-tight" style={{ fontSize: 12.5 }}>
            <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Disclosure played</span><span>{call.disclosurePlayed ? 'Yes' : 'n/a'}</span></div>
            <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Escalation raised</span><span>{call.escalated ? 'Yes — clinical' : 'No'}</span></div>
            <div className="between"><span style={{ color: 'var(--relay-ink-3)' }}>Audio retention</span><span>30 days</span></div>
            <div className="between">
              <span style={{ color: 'var(--relay-ink-3)' }}>Open in patient view</span>
              <Link href={`/referrals/${call.referralId}`}><span className="name-link">{call.referralId}</span></Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLogEntry[]>([]);
  const [selected, setSelected] = useState<CallLogEntry | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  useEffect(() => {
    getCallLog().then(setCalls);
  }, []);

  const outcomes = ['all', 'No Answer', 'Voicemail Left', 'Appointment Accepted', 'Escalated', 'sms'];
  const outcomeLabels: Record<string, string> = {
    'all': 'All outcomes',
    'No Answer': 'No answer',
    'Voicemail Left': 'Voicemail',
    'Appointment Accepted': 'Accepted',
    'Escalated': 'Escalated',
    'sms': 'SMS',
  };

  const filtered = outcomeFilter === 'all'
    ? calls
    : outcomeFilter === 'sms'
    ? calls.filter(c => c.channel === 'sms')
    : calls.filter(c => c.outcome === outcomeFilter);

  return (
    <>
      <PageHead
        title="AI call log"
        sub="Every voice + SMS attempt the AI has made, with transcripts and disclosure status."
      >
        <button className="btn btn-sm"><Icon name="filter" size={12} /> Filters</button>
        <button className="btn btn-sm"><Icon name="download" size={12} /> Export day</button>
      </PageHead>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {outcomes.map(o => (
          <button
            key={o}
            className={`chip${outcomeFilter === o ? ' active' : ''}`}
            onClick={() => setOutcomeFilter(o)}
          >
            {outcomeLabels[o]}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="chip"><Icon name="cal" size={11} /> Today, Apr 14</button>
        <button className="chip"><Icon name="user" size={11} /> Any patient</button>
      </div>

      <div style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 'var(--relay-radius)', overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Time</th>
              <th>Patient</th>
              <th>Attempt</th>
              <th>Channel</th>
              <th>Outcome</th>
              <th>Duration</th>
              <th>Summary</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={i} className="row-clickable" onClick={() => setSelected(c)}>
                <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{c.timestamp}</td>
                <td><span className="name-link">{c.patient}</span></td>
                <td style={{ color: 'var(--relay-ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                  #{c.attempt ?? '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name={c.channel === 'voice' ? 'phone' : 'sms'} size={13} />
                    <span style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
                      {c.channel === 'voice' ? 'Voice' : 'SMS'}
                    </span>
                  </div>
                </td>
                <td>
                  <StatePill state={OUTCOME_STATE[c.outcome] ?? 'Queued'} label={c.outcome} />
                </td>
                <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{c.duration ?? '—'}</td>
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
                  {c.summary}
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={e => { e.stopPropagation(); setSelected(c); }}
                  >
                    <Icon name="arrow" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--relay-ink-3)', fontSize: 13 }}>
            No calls match the current filter.
          </div>
        )}
      </div>

      {selected && <CallDetailModal call={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
