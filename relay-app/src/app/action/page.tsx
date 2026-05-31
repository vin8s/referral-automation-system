'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { PageHead } from '@/components/layout/PageHead';
import { Avatar } from '@/components/shared/Avatar';
import { Icon } from '@/components/shared/Icon';
import { TranscriptPanel } from '@/components/shared/TranscriptPanel';
import { getConfirmQueue, confirmSlot, rejectSlot } from '@/lib/data';
import type { ConfirmQueueItem } from '@/lib/types';

// ── Filter panel ──────────────────────────────────────────────────────────────

interface Filters {
  priority: 'all' | 'urgent';
  provider: string;
  sort: 'captured_asc' | 'captured_desc' | 'priority';
}

const DEFAULT_FILTERS: Filters = { priority: 'all', provider: 'all', sort: 'captured_asc' };

function FilterPanel({
  filters,
  providers,
  onChange,
  onClose,
}: {
  filters: Filters;
  providers: string[];
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50,
        background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
        borderRadius: 'var(--relay-radius)', boxShadow: '0 4px 16px rgba(0,0,0,.10)',
        padding: '16px 18px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--relay-ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Filters</div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--relay-ink-2)' }}>Priority</span>
        <select
          className="select-sm"
          value={filters.priority}
          onChange={e => onChange({ ...filters, priority: e.target.value as Filters['priority'] })}
        >
          <option value="all">All priorities</option>
          <option value="urgent">Urgent only</option>
        </select>
      </label>

      {providers.length > 1 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--relay-ink-2)' }}>Provider</span>
          <select
            className="select-sm"
            value={filters.provider}
            onChange={e => onChange({ ...filters, provider: e.target.value })}
          >
            <option value="all">All providers</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--relay-ink-2)' }}>Sort by</span>
        <select
          className="select-sm"
          value={filters.sort}
          onChange={e => onChange({ ...filters, sort: e.target.value as Filters['sort'] })}
        >
          <option value="captured_asc">Oldest captured first</option>
          <option value="captured_desc">Newest captured first</option>
          <option value="priority">Urgent first</option>
        </select>
      </label>

      <button
        className="btn btn-sm"
        style={{ marginTop: 2 }}
        onClick={() => onChange(DEFAULT_FILTERS)}
      >
        Reset filters
      </button>
    </div>
  );
}

// ── Confirm card ──────────────────────────────────────────────────────────────

function ConfirmCard({ item, onConfirm, onReject }: {
  item: ConfirmQueueItem;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    await onConfirm(item.referralId);
  }

  async function handleReject() {
    setBusy(true);
    await onReject(item.referralId);
  }

  return (
    <div className="card">
      <div className="between" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
          <Avatar name={item.patient} size="lg" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <div className="fw-6" style={{ fontSize: 15 }}>{item.patient}</div>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>
                {item.age}{item.sex} · {item.language} · {item.insurance}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--relay-ink-4)', fontVariantNumeric: 'tabular-nums' }}>
                {item.referralId}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--relay-ink-2)', marginTop: 4 }}>
              <span style={{ color: 'var(--relay-ink-3)' }}>Reason:</span> {item.reason} ·{' '}
              <span style={{ color: 'var(--relay-ink-3)' }}>Referred by</span> {item.referringProvider}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="action-slot" style={{ fontSize: 13, padding: '6px 12px' }}>
                <Icon name="cal" size={13} /> {item.slot.day} · {item.slot.time}
              </span>
              <span className="tag">{item.slot.provider}</span>
              {item.priority === 'urgent' && (
                <span style={{ fontSize: 11.5, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>
                  Urgent
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          captured {item.capturedAgoMin}m ago
        </div>
      </div>

      {item.summary && (
        <div className="transcript-summary" style={{ marginTop: 14, fontSize: 13 }}>
          <span className="fw-6">AI summary · </span>{item.summary}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy} onClick={handleConfirm}>
          <Icon name="check" size={13} /> Confirm — booked in practice system
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={handleReject}>
          <Icon name="x" size={13} /> Reject (re-outreach)
        </button>
        <Link href={`/referrals/${item.referralId}`}>
          <button className="btn"><Icon name="edit" size={13} /> View referral</button>
        </Link>
        <span style={{ flex: 1 }} />
        <button
          className="collapse-toggle"
          onClick={() => setShowTranscript(s => !s)}
        >
          <Icon name="transcript" size={12} />
          {showTranscript ? 'Hide transcript' : 'View transcript'}
          <Icon name="chevron" size={11} />
        </button>
      </div>

      {showTranscript && (
        <div style={{ marginTop: 14 }}>
          <TranscriptPanel
            data={{
              patient: item.patient,
              call: `Attempt · Voice · slot accepted`,
              disclosure: true,
              summary: item.summary,
              turns: item.transcript,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActionPage() {
  const [items, setItems] = useState<ConfirmQueueItem[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    getConfirmQueue().then(setItems);
  }, []);

  async function handleConfirm(referralId: string) {
    await confirmSlot(referralId);
    setItems(prev => prev.filter(i => i.referralId !== referralId));
  }

  async function handleReject(referralId: string) {
    await rejectSlot(referralId);
    setItems(prev => prev.filter(i => i.referralId !== referralId));
  }

  const providers = [...new Set(items.map(i => i.slot.provider).filter(Boolean))].sort();

  const isFiltered = filters.priority !== 'all' || filters.provider !== 'all' || filters.sort !== 'captured_asc';

  const visible = items
    .filter(i => filters.priority === 'all' || i.priority === 'urgent')
    .filter(i => filters.provider === 'all' || i.slot.provider === filters.provider)
    .sort((a, b) => {
      if (filters.sort === 'priority') {
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
      }
      const aMin = a.capturedAgoMin ?? 0;
      const bMin = b.capturedAgoMin ?? 0;
      return filters.sort === 'captured_desc' ? aMin - bMin : bMin - aMin;
    });

  return (
    <>
      <PageHead
        title="Confirm captured slots"
        sub="The AI captured these slots on calls. Commit them in your practice system, then mark confirmed."
      >
        <div style={{ position: 'relative' }}>
          <button
            className={`btn btn-sm${isFiltered ? ' btn-primary' : ''}`}
            onClick={() => setFiltersOpen(o => !o)}
          >
            <Icon name="filter" size={12} /> Filters
            {isFiltered && (
              <span style={{ background: 'white', color: 'var(--relay-accent)', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 5px', marginLeft: 2 }}>
                {[filters.priority !== 'all', filters.provider !== 'all', filters.sort !== 'captured_asc'].filter(Boolean).length}
              </span>
            )}
          </button>
          {filtersOpen && (
            <FilterPanel
              filters={filters}
              providers={providers}
              onChange={setFilters}
              onClose={() => setFiltersOpen(false)}
            />
          )}
        </div>
      </PageHead>

      <div className="alerts-strip calm" style={{ marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--relay-accent-50)', color: 'var(--relay-accent-700)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="info" size={14} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>How this works</div>
          <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 2 }}>
            AI captures an accepted slot → it lands here → you confirm in your scheduling system → Relay mirrors it.
            The richer native approval queue (AI writes directly) lands post-migration.
          </div>
        </div>
      </div>

      {isFiltered && visible.length !== items.length && (
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginBottom: 10 }}>
          Showing {visible.length} of {items.length} · <button className="btn-link" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
        </div>
      )}

      <div className="stack" style={{ gap: 14 }}>
        {items.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--relay-ink-3)' }}>
            <Icon name="check" size={24} />
            <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14 }}>Nothing waiting on you</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>The AI will route confirmations here as patients accept slots.</div>
          </div>
        )}
        {items.length > 0 && visible.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--relay-ink-3)' }}>
            <Icon name="filter" size={20} />
            <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14 }}>No items match these filters</div>
            <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
          </div>
        )}
        {visible.map(item => (
          <ConfirmCard
            key={item.referralId}
            item={item}
            onConfirm={handleConfirm}
            onReject={handleReject}
          />
        ))}
      </div>
    </>
  );
}
