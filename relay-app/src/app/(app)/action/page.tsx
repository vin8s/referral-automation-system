'use client';

// Confirm queue — the MA's single work list, top to bottom:
//   1. Red Escalated referrals (safety: emergency / crisis). Claim, then resolve
//      by moving the referral out of Escalated once the patient is safe.
//   2. Amber "needs a human" items raised by the texting assistant or the eCW
//      import. They never change the referral state; "Mark handled" resolves them.
//   3. AI-captured slots to confirm in the practice system.
// Red and amber are deliberately separate sections with separate treatments.

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { PageHead } from '@/components/layout/PageHead';
import { Avatar } from '@/components/shared/Avatar';
import { Icon } from '@/components/shared/Icon';
import { SmsThread } from '@/components/shared/SmsThread';
import { StatePicker } from '@/components/shared/StatePicker';
import { NeedsHumanList } from '@/components/shared/NeedsHumanList';
import { ScheduleFreshnessBanner } from '@/components/shared/ScheduleFreshnessBanner';
import { getConfirmQueue, confirmSlot, rejectSlot, claimEscalation } from '@/lib/data';
import type { ConfirmQueue, ConfirmQueueItem, EscalationItem, ReferralState } from '@/lib/types';

// ── Filter panel (slots section) ──────────────────────────────────────────────

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

      <button className="btn btn-sm" style={{ marginTop: 2 }} onClick={() => onChange(DEFAULT_FILTERS)}>
        Reset filters
      </button>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────

function SectionHead({ id, tone, title, sub, count, children }: {
  id: string; tone: 'escalated' | 'amber' | 'accent'; title: string; sub: string; count: number; children?: React.ReactNode;
}) {
  const chip = tone === 'escalated'
    ? { background: 'var(--st-escalated-bg)', color: 'var(--st-escalated-fg)' }
    : tone === 'amber'
      ? { background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)' }
      : { background: 'var(--st-accepted-bg)', color: 'var(--st-accepted-fg)' };
  return (
    <div id={id} className="between" style={{ alignItems: 'flex-end', gap: 16, margin: '8px 0 10px', scrollMarginTop: 72 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, ...chip }}>{count}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 3 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

// ── 1. Red escalation card ───────────────────────────────────────────────────

function EscalationCard({ item, onClaim, onResolved }: {
  item: EscalationItem;
  onClaim: (id: string) => Promise<void>;
  onResolved: (id: string, next: ReferralState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const claimed = !!item.owner;
  const lastPatient = [...item.excerpt].reverse().find(t => t.who === 'patient') ?? item.excerpt[item.excerpt.length - 1];

  return (
    <div className="card" style={{
      // Red = Escalated (safety). Never the amber "needs a human" treatment.
      borderColor: claimed ? 'var(--relay-hairline)' : '#fecaca',
      background: claimed ? 'var(--relay-surface)' : '#fef2f2',
      boxShadow: claimed ? undefined : 'inset 3px 0 0 var(--st-escalated-fg)',
    }}>
      <div className="between" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: 'var(--st-escalated-bg)', color: 'var(--st-escalated-fg)',
            display: 'grid', placeItems: 'center',
          }}>
            <Icon name="alert" size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="fw-6">{item.reason}</div>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>· {item.raisedAt}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Patient: <Link href={`/referrals/${item.referralId}`}><span className="name-link">{item.patient}</span></Link>
              <span style={{ color: 'var(--relay-ink-3)' }}> · {item.referralId}</span>
            </div>
            {lastPatient && (
              <div className="transcript-summary" style={{ marginTop: 10, fontSize: 12.5, borderLeftColor: 'var(--st-escalated-fg)' }}>
                <span className="fw-6">{lastPatient.who === 'patient' ? 'Patient texted' : 'Assistant'} · </span>
                &ldquo;{lastPatient.text}&rdquo;
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
          {claimed ? (
            <span style={{ fontSize: 11.5, background: 'var(--st-outreach-bg)', color: 'var(--st-outreach-fg)', padding: '2px 9px', borderRadius: 99, fontWeight: 500 }}>
              In progress · {item.owner}
            </span>
          ) : (
            <button
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={async () => { setBusy(true); await onClaim(item.referralId); setBusy(false); }}
            >
              <Icon name="check" size={12} /> {busy ? 'Claiming…' : <>I&apos;ll take it</>}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
            Resolve:
            <StatePicker referralId={item.referralId} current="Escalated" onChange={onResolved} />
          </div>
          <Link href={`/referrals/${item.referralId}`}>
            <button className="btn btn-sm btn-ghost">View texts <Icon name="arrow" size={11} /></button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── 3. Slot confirm card ─────────────────────────────────────────────────────

function ConfirmCard({ item, onConfirm, onReject }: {
  item: ConfirmQueueItem;
  onConfirm: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  const [showThread, setShowThread] = useState(false);
  const [busy, setBusy] = useState(false);
  const excerpt = item.smsExcerpt ?? [];

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
              <span className="tag" title="The patient picked this time by text">
                <Icon name="sms" size={11} />&nbsp;Picked by text
              </span>
              {item.priority === 'urgent' && (
                <span style={{ fontSize: 11.5, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>
                  Urgent
                </span>
              )}
            </div>
          </div>
        </div>
        {item.capturedAgoMin != null && (
          <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            captured {item.capturedAgoMin}m ago
          </div>
        )}
      </div>

      {item.summary && (
        <div className="transcript-summary" style={{ marginTop: 14, fontSize: 13 }}>
          <span className="fw-6">AI summary · </span>{item.summary}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(item.referralId); }}>
          <Icon name="check" size={13} /> Confirm — booked in practice system
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={async () => { setBusy(true); await onReject(item.referralId); }}>
          <Icon name="x" size={13} /> Reject (re-outreach)
        </button>
        <Link href={`/referrals/${item.referralId}`}>
          <button className="btn"><Icon name="edit" size={13} /> View referral</button>
        </Link>
        <span style={{ flex: 1 }} />
        <button className="collapse-toggle" onClick={() => setShowThread(s => !s)}>
          <Icon name="sms" size={12} />
          {showThread ? 'Hide texts' : 'View texts'}
          <Icon name="chevron" size={11} />
        </button>
      </div>

      {!showThread && excerpt.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <SmsThread messages={excerpt.slice(-2)} maxHeight={180} compact />
        </div>
      )}
      {showThread && (
        <div style={{ marginTop: 14 }}>
          <SmsThread messages={excerpt} maxHeight={320} compact emptyText="No texts recorded." />
        </div>
      )}
    </div>
  );
}

function EmptyCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--relay-ink-3)' }}>
      <Icon name="check" size={20} />
      <div style={{ marginTop: 8, fontWeight: 600, fontSize: 13.5 }}>{title}</div>
      <div style={{ fontSize: 12.5, marginTop: 3 }}>{sub}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const EMPTY_QUEUE: ConfirmQueue = { escalations: [], needsHuman: [], slots: [] };

export default function ActionPage() {
  const [queue, setQueue] = useState<ConfirmQueue>(EMPTY_QUEUE);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scrolledRef = useRef(false);

  const load = useCallback(async () => {
    const q = await getConfirmQueue();
    setQueue(q);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep links (/action#escalated, #needs-human, #slots) land on the section once it renders.
  useEffect(() => {
    if (!loaded || scrolledRef.current || !window.location.hash) return;
    scrolledRef.current = true;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [loaded]);

  const { escalations, needsHuman, slots } = queue;

  async function handleClaim(referralId: string) {
    await claimEscalation(referralId);
    await load();
  }

  function handleResolved(referralId: string, next: ReferralState) {
    if (next === 'Escalated') return;
    setQueue(q => ({ ...q, escalations: q.escalations.filter(e => e.referralId !== referralId) }));
    load();
  }

  async function handleConfirm(referralId: string) {
    await confirmSlot(referralId);
    setQueue(q => ({ ...q, slots: q.slots.filter(i => i.referralId !== referralId) }));
  }

  async function handleReject(referralId: string) {
    await rejectSlot(referralId);
    setQueue(q => ({ ...q, slots: q.slots.filter(i => i.referralId !== referralId) }));
  }

  const providers = [...new Set(slots.map(i => i.slot.provider).filter(Boolean))].sort();
  const isFiltered = filters.priority !== 'all' || filters.provider !== 'all' || filters.sort !== 'captured_asc';

  const visible = slots
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

  const openEscalations = escalations.filter(e => !e.owner).length;

  return (
    <>
      <PageHead
        title="Confirm queue"
        sub="Everything waiting on you, most urgent first: escalations, then items that need a human, then slots to confirm."
      />

      <ScheduleFreshnessBanner />

      {/* 1 ── Red: Escalated */}
      <SectionHead
        id="escalated"
        tone="escalated"
        title="Escalated — act now"
        sub="Possible emergency or crisis. Texting is paused. Call the patient, then move the referral out of Escalated."
        count={escalations.length}
      >
        {escalations.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>
            {openEscalations} unclaimed · {escalations.length - openEscalations} in progress
          </span>
        )}
      </SectionHead>
      <div className="stack" style={{ gap: 12, marginBottom: 24 }}>
        {loaded && escalations.length === 0 && (
          <EmptyCard title="No escalations" sub="Nothing urgent right now." />
        )}
        {escalations.map(e => (
          <EscalationCard key={e.referralId} item={e} onClaim={handleClaim} onResolved={handleResolved} />
        ))}
      </div>

      {/* 2 ── Amber: needs a human */}
      <SectionHead
        id="needs-human"
        tone="amber"
        title="Needs a human"
        sub="Raised by the texting assistant or the eCW import. Normal work, same business day. The referral state does not change."
        count={needsHuman.length}
      />
      <div className="card" style={{ marginBottom: 24 }}>
        {loaded && needsHuman.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>Nothing waiting.</div>
        ) : (
          <NeedsHumanList
            items={needsHuman}
            showPatient
            onResolved={id => setQueue(q => ({ ...q, needsHuman: q.needsHuman.filter(i => i.id !== id) }))}
          />
        )}
      </div>

      {/* 3 ── Slots to confirm */}
      <SectionHead
        id="slots"
        tone="accent"
        title="Slots to confirm"
        sub="The patient picked these times by text. Book them in your practice system, then mark confirmed."
        count={slots.length}
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
      </SectionHead>

      {isFiltered && visible.length !== slots.length && (
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginBottom: 10 }}>
          Showing {visible.length} of {slots.length} · <button className="btn-link" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
        </div>
      )}

      <div className="stack" style={{ gap: 14 }}>
        {loaded && slots.length === 0 && (
          <EmptyCard title="No slots waiting" sub="Times patients pick by text land here for you to confirm." />
        )}
        {slots.length > 0 && visible.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--relay-ink-3)' }}>
            <Icon name="filter" size={20} />
            <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14 }}>No items match these filters</div>
            <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
          </div>
        )}
        {visible.map(item => (
          <ConfirmCard key={item.referralId} item={item} onConfirm={handleConfirm} onReject={handleReject} />
        ))}
        <div style={{ fontSize: 11.5, color: 'var(--relay-ink-4)' }}>
          Connector mode: Relay never writes to eCW. Confirming records that you booked the slot there (prototype).
        </div>
      </div>
    </>
  );
}
