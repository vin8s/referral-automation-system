'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { utils as xlsxUtils, writeFileXLSX } from 'xlsx';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { StatePill } from '@/components/shared/StatePill';
import { TranscriptPanel } from '@/components/shared/TranscriptPanel';
import { getReferralLog } from '@/lib/data';
import type { ReferralLogEntry } from '@/lib/types';

function exportLog(entries: ReferralLogEntry[], label: string) {
  const data = entries.map(e => ({
    'Time':               e.at,
    'Patient':            e.patient,
    'Referral ID':        e.referralId,
    'Type':               e.type === 'ai_call' ? 'AI call' : e.type === 'manual_update' ? 'Manual update' : 'System',
    'Who':                e.who,
    'Event':              e.what,
    'Channel':            e.channel ?? '',
    'Outcome':            e.outcome ?? '',
    'Duration':           e.duration ?? '',
    'Disclosure Played':  e.disclosurePlayed != null ? (e.disclosurePlayed ? 'Yes' : 'No') : '',
    'Escalated':          e.escalated != null ? (e.escalated ? 'Yes' : 'No') : '',
    'Summary':            e.detail ?? '',
  }));
  const ws = xlsxUtils.json_to_sheet(data);
  ws['!cols'] = Object.keys(data[0] ?? {}).map(k =>
    ({ wch: Math.max(k.length, ...data.map(row => String((row as Record<string, unknown>)[k] ?? '').length)) + 2 })
  );
  const wb = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(wb, ws, 'Referral Log');
  const date = new Date().toISOString().slice(0, 10);
  writeFileXLSX(wb, `relay-referral-log-${label}-${date}.xlsx`);
}

function typeChipStyle(type: ReferralLogEntry['type']): { bg: string; fg: string; label: string } {
  if (type === 'ai_call')       return { bg: 'var(--st-outreach-bg)',  fg: 'var(--st-outreach-fg)',  label: 'AI call'        };
  if (type === 'manual_update') return { bg: 'var(--st-queued-bg)',    fg: 'var(--st-queued-fg)',    label: 'Manual update'  };
  return                               { bg: 'var(--relay-tint)',       fg: 'var(--relay-ink-3)',     label: 'System'         };
}

function LogDetailModal({ entry, onClose }: { entry: ReferralLogEntry; onClose: () => void }) {
  return (
    <div className="modal-shade" onClick={onClose}>
      <div className="relay-modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
        <div className="relay-modal-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>{entry.patient}</h3>
              {entry.attempt != null && (
                <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>· attempt #{entry.attempt}</span>
              )}
              {entry.escalated && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                  background: 'var(--st-escalated-bg)', color: 'var(--st-escalated-fg)',
                }}>Escalated</span>
              )}
            </div>
            <p className="card-sub">
              {entry.at}
              {entry.channel && ` · ${entry.channel === 'voice' ? 'Voice' : 'SMS'}`}
              {entry.duration && ` · ${entry.duration}`}
            </p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={13} /></button>
        </div>
        <div className="relay-modal-body">
          {entry.detail ? (
            <TranscriptPanel
              data={{
                patient: entry.patient,
                call: `${entry.referralId} · ${entry.what}`,
                disclosure: entry.disclosurePlayed ?? false,
                summary: entry.detail,
                turns: [],
              }}
            />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--relay-ink-2)', padding: '8px 0' }}>{entry.what}</div>
          )}
          <div className="relay-divider" />
          <div className="stack-tight" style={{ fontSize: 12.5 }}>
            <div className="between">
              <span style={{ color: 'var(--relay-ink-3)' }}>Who</span>
              <span>{entry.who}</span>
            </div>
            {entry.disclosurePlayed != null && (
              <div className="between">
                <span style={{ color: 'var(--relay-ink-3)' }}>Disclosure played</span>
                <span>{entry.disclosurePlayed ? 'Yes' : 'n/a'}</span>
              </div>
            )}
            {entry.escalated != null && (
              <div className="between">
                <span style={{ color: 'var(--relay-ink-3)' }}>Escalation raised</span>
                <span>{entry.escalated ? 'Yes — clinical' : 'No'}</span>
              </div>
            )}
            <div className="between">
              <span style={{ color: 'var(--relay-ink-3)' }}>Open referral</span>
              <Link href={`/referrals/${entry.referralId}`}><span className="name-link">{entry.referralId}</span></Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function CallsPage() {
  const router = useRouter();
  const [log, setLog] = useState<ReferralLogEntry[]>([]);
  const [selected, setSelected] = useState<ReferralLogEntry | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'ai_call' | 'manual_update' | 'system'>('all');
  const [search, setSearch] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getReferralLog().then(setLog);
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const trimmed = search.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (trimmed.length < 1) return [];
    const seen = new Set<string>();
    const results: { patient: string; count: number }[] = [];
    log.forEach(e => {
      if (!seen.has(e.patient) && e.patient.toLowerCase().includes(trimmed)) {
        seen.add(e.patient);
        results.push({ patient: e.patient, count: log.filter(x => x.patient === e.patient).length });
      }
    });
    return results.slice(0, 6);
  }, [trimmed, log]);

  function commitSuggestion(patient: string) {
    setSearch(patient);
    setSuggestOpen(false);
    setActiveIdx(-1);
  }

  function highlight(text: string) {
    if (!trimmed) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(trimmed);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <strong style={{ color: 'var(--relay-ink)' }}>{text.slice(idx, idx + trimmed.length)}</strong>
        {text.slice(idx + trimmed.length)}
      </>
    );
  }

  const typeFilters: { key: 'all' | 'ai_call' | 'manual_update' | 'system'; label: string; dot?: string }[] = [
    { key: 'all',           label: 'All'            },
    { key: 'ai_call',       label: 'AI calls',       dot: 'var(--relay-accent)'   },
    { key: 'manual_update', label: 'Manual updates', dot: 'var(--st-queued-fg)'   },
    { key: 'system',        label: 'System events',  dot: 'var(--relay-ink-4)'    },
  ];

  const filtered = log.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.patient.toLowerCase().includes(q) || e.referralId.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <PageHead
        title="Referral log"
        sub="All activity — AI calls, manual edits, and system events, across every referral."
      >
        <button
          className="btn btn-sm"
          onClick={() => exportLog(filtered, typeFilter)}
          disabled={filtered.length === 0}
          title={`Export ${filtered.length} log entr${filtered.length !== 1 ? 'ies' : 'y'} to Excel`}
        >
          <Icon name="download" size={12} /> Export{filtered.length > 0 ? ` (${filtered.length})` : ''}
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => router.push('/ingest')}>
          <Icon name="upload" size={12} /> Ingest
        </button>
      </PageHead>

      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 12, padding: '10px 14px',
        background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
        borderRadius: 'var(--relay-radius) var(--relay-radius) 0 0',
      }}>
        {/* Search with autocomplete */}
        <div ref={searchContainerRef} style={{ position: 'relative', flex: '0 1 260px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 9px', background: 'var(--relay-tint)',
            border: '1px solid var(--relay-hairline)', borderRadius: 7,
          }}>
            <Icon name="search" size={13} />
            <input
              ref={searchInputRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setActiveIdx(-1); setSuggestOpen(true); }}
              onFocus={() => { if (search.trim()) setSuggestOpen(true); }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); setSuggestOpen(true); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
                else if (e.key === 'Enter') { if (activeIdx >= 0 && suggestions[activeIdx]) commitSuggestion(suggestions[activeIdx].patient); else setSuggestOpen(false); }
                else if (e.key === 'Escape') { setSuggestOpen(false); setActiveIdx(-1); }
              }}
              placeholder="Search patient name…"
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 13, color: 'var(--relay-ink)', fontFamily: 'inherit' }}
              autoComplete="off"
            />
            {search && (
              <button
                onMouseDown={e => { e.preventDefault(); setSearch(''); setSuggestOpen(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--relay-ink-3)' }}
                aria-label="Clear"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>

          {suggestOpen && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
              borderRadius: 10, boxShadow: 'var(--relay-shadow-pop)',
              overflow: 'hidden', zIndex: 600, minWidth: 260,
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={s.patient}
                  onMouseDown={e => { e.preventDefault(); commitSuggestion(s.patient); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', cursor: 'pointer',
                    background: i === activeIdx ? 'var(--relay-tint)' : 'transparent',
                    borderBottom: i < suggestions.length - 1 ? '1px solid var(--relay-hairline)' : 'none',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--relay-accent-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, color: 'var(--relay-accent-700)',
                  }}>
                    {s.patient.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--relay-ink-2)', lineHeight: 1.3 }}>
                      {highlight(s.patient)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', marginTop: 1 }}>
                      {s.count} log {s.count !== 1 ? 'entries' : 'entry'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Type segmented control */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--relay-hairline)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          {typeFilters.map((f, i) => {
            const count = f.key === 'all' ? log.length : log.filter(e => e.type === f.key).length;
            const on = typeFilter === f.key;
            return (
              <button key={f.key} onClick={() => setTypeFilter(f.key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', border: 'none',
                borderLeft: i > 0 ? '1px solid var(--relay-hairline)' : 'none',
                background: on ? 'var(--relay-accent)' : 'transparent',
                cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 600 : 400,
                color: on ? '#fff' : 'var(--relay-ink-2)', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}>
                {f.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: on ? 'rgba(255,255,255,0.7)' : f.dot }} />}
                {f.label}
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 5px', borderRadius: 99, background: on ? 'rgba(255,255,255,0.22)' : 'var(--relay-tint)', color: on ? '#fff' : 'var(--relay-ink-3)', minWidth: 16, textAlign: 'center' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <span style={{ flex: 1 }} />
      </div>

      <div style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderTop: 0, borderRadius: '0 0 var(--relay-radius) var(--relay-radius)', overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Time</th>
              <th>Patient</th>
              <th>Referral</th>
              <th>State</th>
              <th>Type</th>
              <th>Who</th>
              <th>Event</th>
              <th>Detail</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => {
              const chip = typeChipStyle(entry.type);
              return (
                <tr
                  key={i}
                  className={entry.type === 'ai_call' ? 'row-clickable' : undefined}
                  onClick={entry.type === 'ai_call' ? () => setSelected(entry) : undefined}
                  style={{ cursor: entry.type === 'ai_call' ? 'pointer' : 'default' }}
                >
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, whiteSpace: 'nowrap' }}>{entry.at}</td>
                  <td><span className="name-link">{entry.patient}</span></td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                    <Link href={`/referrals/${entry.referralId}`} onClick={e => e.stopPropagation()}>
                      <span className="name-link">{entry.referralId}</span>
                    </Link>
                  </td>
                  <td style={{ overflow: 'visible' }}>
                    {entry.referralState && <StatePill state={entry.referralState} />}
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 99,
                      background: chip.bg, color: chip.fg, whiteSpace: 'nowrap',
                    }}>
                      {chip.label}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>{entry.who}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.what}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.type !== 'ai_call' ? entry.detail ?? '—' : (
                      <span style={{ color: 'var(--relay-ink-4)', fontStyle: 'italic' }}>
                        {entry.detail ? entry.detail.substring(0, 80) + (entry.detail.length > 80 ? '…' : '') : '—'}
                      </span>
                    )}
                  </td>
                  <td>
                    {entry.type === 'ai_call' && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={e => { e.stopPropagation(); setSelected(entry); }}
                      >
                        <Icon name="arrow" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--relay-ink-3)', fontSize: 13 }}>
            No entries match the current filter.
          </div>
        )}
      </div>

      {selected && <LogDetailModal entry={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
