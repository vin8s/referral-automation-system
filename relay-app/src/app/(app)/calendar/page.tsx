'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { getCalendarEvents, updateCalendarEvent, deleteCalendarEvent } from '@/lib/data';
import type { CalendarEvent } from '@/lib/types';

// ── Constants ─────────────────────────────────────────────────────────────────

// Prototype "today" anchor — all mock data is relative to Apr 14, 2026
const PROTOTYPE_TODAY = new Date(2026, 3, 14);
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const HOUR_SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

// Provider colors — within Relay design tokens; teal for Dr. Park, green for Dr. Lin, blue for Dr. Chen
const PROVIDER_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  'Dr. Park': { bg: 'var(--relay-accent-50)', fg: 'var(--relay-accent-800)', border: 'var(--relay-accent-200)' },
  'Dr. Lin':  { bg: '#d1fae5', fg: '#065f46', border: '#a7f3d0' },
  'Dr. Chen': { bg: 'var(--st-queued-bg)', fg: 'var(--st-queued-fg)', border: '#bfdbfe' },
};
const FALLBACK_COLOR = { bg: 'var(--relay-accent-50)', fg: 'var(--relay-accent-800)', border: 'var(--relay-accent-200)' };

// ── Date helpers ──────────────────────────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
}

function parseEventDate(dayStr: string, timeStr: string): Date {
  // Standard format: "Mon Apr 14" | "Wed May 6"
  const parts = dayStr.trim().split(' ');
  const month = MONTH_SHORT.indexOf(parts[1]);
  const day = parseInt(parts[2], 10);
  if (month !== -1 && !isNaN(day)) {
    // Handle both "2:00 PM" and "2 PM" (no minutes)
    const m = timeStr.toLowerCase().match(/(\d+)(?::(\d+))?\s*(am|pm)/);
    if (!m) return new Date(2026, month, day, 9, 0);
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (m[3] === 'pm' && h !== 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return new Date(2026, month, day, h, min);
  }
  // Fallback for non-standard strings (e.g. ElevenLabs-returned "June 8, 2026")
  const fallback = new Date(dayStr);
  return isNaN(fallback.getTime()) ? new Date(PROTOTYPE_TODAY) : fallback;
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

// ── Provider / location filter dropdown ──────────────────────────────────────

function FilterDropdown({
  icon,
  allLabel,
  options,
  value,
  onChange,
}: {
  icon: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const isFiltered = value !== 'all';
  const displayLabel = isFiltered ? value : allLabel;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn btn-sm"
        onClick={() => setOpen(o => !o)}
        style={isFiltered ? {
          background: 'var(--relay-accent-50)',
          borderColor: 'var(--relay-accent-200)',
          color: 'var(--relay-accent-800)',
        } : undefined}
      >
        <Icon name={icon} size={12} />
        {displayLabel}
        <Icon name="chevron" size={11} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
          background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
          borderRadius: 8, boxShadow: 'var(--relay-shadow-pop)', padding: 6, minWidth: 168,
        }}>
          {[{ val: 'all', label: allLabel }, ...options.map(o => ({ val: o, label: o }))].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => { onChange(val); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', border: 0, borderRadius: 5, padding: '6px 10px',
                background: value === val ? 'var(--relay-accent-50)' : 'transparent',
                color: value === val ? 'var(--relay-accent-800)' : 'var(--relay-ink-2)',
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              {value === val && <Icon name="check" size={12} />}
              {value !== val && <span style={{ width: 12 }} />}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Appointment chip ──────────────────────────────────────────────────────────

function ApptChip({ event, compact, onClick, highlighted }: {
  event: CalendarEvent;
  compact?: boolean;
  onClick?: () => void;
  highlighted?: boolean;
}) {
  const colors = event.isShadow ? null : (PROVIDER_COLORS[event.provider] ?? FALLBACK_COLOR);
  return (
    <div
      onClick={onClick}
      className={event.isShadow ? 'cal-appt shadow' : 'cal-appt'}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        ...(!event.isShadow && colors ? {
          background: colors.bg,
          borderColor: colors.border,
          color: colors.fg,
        } : {}),
        ...(highlighted ? {
          outline: '2px solid var(--relay-accent)',
          outlineOffset: 1,
          boxShadow: '0 0 0 4px var(--relay-accent-100)',
        } : {}),
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {event.isShadow ? `(shadow) ${event.patient}` : event.patient}
      </div>
      {!compact && (
        <div style={{ fontSize: 10.5, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.reason}
        </div>
      )}
      {!event.isShadow && !compact && (
        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 1 }}>
          {event.provider} · {event.time}
        </div>
      )}
    </div>
  );
}

// ── Event detail modal ────────────────────────────────────────────────────────

function EventModal({
  event,
  onClose,
  onSave,
  onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onSave: (referralId: string, updates: { day: string; time: string; provider: string; location: string }) => Promise<void>;
  onDelete: (referralId: string) => Promise<void>;
}) {
  const colors = PROVIDER_COLORS[event.provider] ?? FALLBACK_COLOR;
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({ day: event.day, time: event.time, provider: event.provider, location: event.location });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(event.referralId, draft);
    setSaving(false);
  }

  async function handleDelete() {
    setSaving(true);
    await onDelete(event.referralId);
    setSaving(false);
  }

  function cancelEdit() {
    setEditMode(false);
    setDraft({ day: event.day, time: event.time, provider: event.provider, location: event.location });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '5px 8px', fontSize: 13,
    border: '1px solid var(--relay-hairline)', borderRadius: 5,
    background: 'var(--relay-surface)', color: 'var(--relay-ink)',
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div className="modal-shade" onClick={onClose}>
      <div className="relay-modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="relay-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="cal" size={15} style={{ color: 'var(--relay-accent)' }} />
            <h3 style={{ margin: 0, fontSize: 15 }}>{event.patient}</h3>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="relay-modal-body">
          {confirmDelete ? (
            <>
              <p style={{ fontSize: 13.5, color: 'var(--relay-ink-2)', margin: '0 0 16px' }}>
                Remove this appointment and return <strong>{event.patient}</strong> to Pending Confirmation?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm"
                  style={{ flex: 1, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {saving ? 'Deleting…' : 'Delete appointment'}
                </button>
              </div>
            </>
          ) : editMode ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 16 }}>
                {(['day', 'time', 'provider', 'location'] as const).map(field => (
                  <div key={field}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--relay-ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      {field === 'day' ? 'Date' : field.charAt(0).toUpperCase() + field.slice(1)}
                    </div>
                    <input
                      value={draft[field]}
                      onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                      style={inputStyle}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--relay-accent)'; e.currentTarget.style.boxShadow = '0 0 0 2px var(--relay-accent-100)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--relay-hairline)'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" style={{ flex: 1 }} onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
                <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 14 }}>
                {[
                  ['Reason', event.reason],
                  ['Provider', event.provider],
                  ['Date', event.day],
                  ['Time', event.time],
                  ['Location', event.location],
                  ['Referral', event.referralId],
                ].map(([lbl, val]) => (
                  <div key={lbl}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--relay-ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                      {lbl}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--relay-ink-2)', fontWeight: 500 }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: colors.bg, color: colors.fg,
                border: `1px solid ${colors.border}`,
                padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                marginBottom: 14,
              }}>
                <Icon name="check" size={12} /> Confirmed · mirrored to shadow calendar
              </div>
              {!event.isShadow && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setEditMode(true)}>
                    <Icon name="edit" size={12} /> Edit
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1, color: '#b91c1c' }}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" size={12} /> Delete
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main calendar page ────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(PROTOTYPE_TODAY));
  const [view, setView] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date(PROTOTYPE_TODAY));
  const [viewAnchor, setViewAnchor] = useState(() => new Date(PROTOTYPE_TODAY.getFullYear(), PROTOTYPE_TODAY.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [providers, setProviders] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [activeModal, setActiveModal] = useState<CalendarEvent | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [highlightedReferralId, setHighlightedReferralId] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const minWeekStart = getWeekStart(addDays(PROTOTYPE_TODAY, -28));
  const maxWeekStart = (() => {
    const d = new Date(PROTOTYPE_TODAY);
    d.setFullYear(d.getFullYear() + 2);
    return getWeekStart(d);
  })();

  useEffect(() => {
    getCalendarEvents().then(evts => {
      setEvents(evts);
      setProviders([...new Set(evts.map(e => e.provider).filter(Boolean))]);
      setLocations([...new Set(evts.map(e => e.location).filter(Boolean))]);
    });
  }, []);

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const filteredEvents = events.filter(e => {
    if (selectedProvider !== 'all' && e.provider !== selectedProvider) return false;
    if (selectedLocation !== 'all' && e.location !== selectedLocation) return false;
    return true;
  });

  function eventsForCell(day: Date, hour: number): CalendarEvent[] {
    return filteredEvents.filter(e => {
      const ed = parseEventDate(e.day, e.time);
      return isSameDay(ed, day) && ed.getHours() === hour;
    });
  }

  function eventsForDay(day: Date): CalendarEvent[] {
    return filteredEvents.filter(e => isSameDay(parseEventDate(e.day, e.time), day));
  }

  function bookedCountForDay(day: Date): number {
    return filteredEvents.filter(e => isSameDay(parseEventDate(e.day, e.time), day) && !e.isShadow).length;
  }

  // Build Mon-first 42-cell month grid
  function getMonthGrid(anchor: Date): { date: Date; inMonth: boolean }[] {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const first = new Date(year, month, 1);
    const firstDow = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ date: addDays(first, -(i + 1)), inMonth: false });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d), inMonth: true });
    while (cells.length < 42) cells.push({ date: addDays(cells[cells.length - 1].date, 1), inMonth: false });
    return cells;
  }

  function switchView(v: 'day' | 'week' | 'month' | 'year') {
    if (v === 'month' || v === 'year') {
      setViewAnchor(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1));
    }
    setView(v);
  }

  function prevPeriod() {
    if (view === 'week' || view === 'day') prevWeek();
    else if (view === 'month') setViewAnchor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else setViewAnchor(d => new Date(d.getFullYear() - 1, d.getMonth(), 1));
  }
  function nextPeriod() {
    if (view === 'week' || view === 'day') nextWeek();
    else if (view === 'month') setViewAnchor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else setViewAnchor(d => new Date(d.getFullYear() + 1, d.getMonth(), 1));
  }

  function prevWeek() {
    setWeekStart(ws => {
      const p = addDays(ws, -7);
      return p >= minWeekStart ? p : ws;
    });
  }

  function nextWeek() {
    setWeekStart(ws => {
      const n = addDays(ws, 7);
      return n <= maxWeekStart ? n : ws;
    });
  }

  function goToToday() {
    setWeekStart(getWeekStart(PROTOTYPE_TODAY));
    setSelectedDay(new Date(PROTOTYPE_TODAY));
    setView('week');
  }

  // Close patient search dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setPatientSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  async function refreshEvents() {
    const evts = await getCalendarEvents();
    setEvents(evts);
    setProviders([...new Set(evts.map(e => e.provider).filter(Boolean))]);
    setLocations([...new Set(evts.map(e => e.location).filter(Boolean))]);
  }

  async function handleEventSave(referralId: string, updates: { day: string; time: string; provider: string; location: string }) {
    await updateCalendarEvent(referralId, updates);
    await refreshEvents();
    setActiveModal(null);
  }

  async function handleEventDelete(referralId: string) {
    await deleteCalendarEvent(referralId);
    await refreshEvents();
    setActiveModal(null);
  }

  function jumpToEvent(event: CalendarEvent) {
    const date = parseEventDate(event.day, event.time);
    setWeekStart(getWeekStart(date));
    setSelectedDay(date);
    setPatientSearch('');
    setPatientSearchOpen(false);
    setHighlightedReferralId(event.referralId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedReferralId(null), 2500);
  }

  const trimmedSearch = patientSearch.trim().toLowerCase();

  // Parse search as a date query if it contains a month name
  const dateQuery: { month: number; day?: number } | null = (() => {
    if (!trimmedSearch) return null;
    for (let i = 0; i < MONTH_FULL.length; i++) {
      if (trimmedSearch.includes(MONTH_FULL[i].toLowerCase()) || trimmedSearch.includes(MONTH_SHORT[i].toLowerCase())) {
        const dayMatch = patientSearch.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
        const day = dayMatch ? parseInt(dayMatch[1], 10) : undefined;
        return { month: i, day };
      }
    }
    return null;
  })();

  const patientSuggestions = trimmedSearch.length > 0
    ? events
        .filter(e => !e.isShadow && (
          e.patient.toLowerCase().includes(trimmedSearch) ||
          (dateQuery !== null && (() => {
            const d = parseEventDate(e.day, e.time);
            return d.getMonth() === dateQuery.month &&
              (dateQuery.day === undefined || d.getDate() === dateQuery.day);
          })())
        ))
        .slice(0, 6)
    : [];

  const weekEnd = addDays(weekStart, 4);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const weekLabel = sameMonth
    ? `${MONTH_FULL[weekStart.getMonth()]} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`
    : `${MONTH_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;

  const atMin = weekStart <= minWeekStart;
  const atMax = addDays(weekStart, 7) > maxWeekStart;

  return (
    <>
      <PageHead
        title="Calendar"
        sub="Confirmed bookings"
      >
        <div className="variations">
          {(['day', 'week', 'month', 'year'] as const).map(v => (
            <button
              key={v}
              className={`variation-btn${view === v ? ' active' : ''}`}
              onClick={() => switchView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <FilterDropdown
          icon="user"
          allLabel="All providers"
          options={providers}
          value={selectedProvider}
          onChange={setSelectedProvider}
        />
        <FilterDropdown
          icon="map"
          allLabel="All locations"
          options={locations}
          value={selectedLocation}
          onChange={setSelectedLocation}
        />
      </PageHead>

      {/* Navigation bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <button
          className="btn btn-sm"
          onClick={prevPeriod}
          disabled={(view === 'week' || view === 'day') && atMin}
          title="Previous"
          style={{ opacity: (view === 'week' || view === 'day') && atMin ? 0.35 : 1, minWidth: 32, justifyContent: 'center', fontSize: 16, lineHeight: 1 }}
        >
          ‹
        </button>
        <button className="btn btn-sm" onClick={goToToday}>Today</button>
        <button
          className="btn btn-sm"
          onClick={nextPeriod}
          disabled={(view === 'week' || view === 'day') && atMax}
          title="Next"
          style={{ opacity: (view === 'week' || view === 'day') && atMax ? 0.35 : 1, minWidth: 32, justifyContent: 'center', fontSize: 16, lineHeight: 1 }}
        >
          ›
        </button>

        <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--relay-ink)', marginLeft: 4 }}>
          {view === 'month' ? `${MONTH_FULL[viewAnchor.getMonth()]} ${viewAnchor.getFullYear()}`
           : view === 'year' ? `${viewAnchor.getFullYear()}`
           : weekLabel}
        </span>

        {/* Patient search */}
        <div ref={searchContainerRef} style={{ position: 'relative', flex: '0 1 220px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 9px',
            background: 'var(--relay-tint)',
            border: '1px solid var(--relay-hairline)',
            borderRadius: 7,
          }}>
            <Icon name="search" size={13} style={{ color: 'var(--relay-ink-3)', flexShrink: 0 }} />
            <input
              value={patientSearch}
              onChange={e => { setPatientSearch(e.target.value); setPatientSearchOpen(true); }}
              onFocus={() => { if (patientSearch.trim()) setPatientSearchOpen(true); }}
              onKeyDown={e => {
                if (e.key === 'Escape') { setPatientSearch(''); setPatientSearchOpen(false); }
                if (e.key === 'Enter' && patientSuggestions.length > 0) jumpToEvent(patientSuggestions[0]);
              }}
              placeholder="Find patient or date…"
              autoComplete="off"
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 12.5, color: 'var(--relay-ink)', fontFamily: 'inherit', minWidth: 0 }}
            />
            {patientSearch && (
              <button
                onMouseDown={e => { e.preventDefault(); setPatientSearch(''); setPatientSearchOpen(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--relay-ink-3)' }}
              >
                <Icon name="x" size={11} />
              </button>
            )}
          </div>

          {patientSearchOpen && (patientSuggestions.length > 0 || (dateQuery !== null && trimmedSearch.length > 1)) && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
              borderRadius: 9, boxShadow: 'var(--relay-shadow-pop)', overflow: 'hidden', zIndex: 200,
              minWidth: 280,
            }}>
              {/* Jump-to-date row when a date was parsed */}
              {dateQuery !== null && (
                <div
                  onMouseDown={e => {
                    e.preventDefault();
                    const year = 2026;
                    const target = new Date(year, dateQuery.month, dateQuery.day ?? 1);
                    setWeekStart(getWeekStart(target));
                    if (dateQuery.day !== undefined) setSelectedDay(target);
                    setPatientSearch('');
                    setPatientSearchOpen(false);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer',
                    borderBottom: patientSuggestions.length > 0 ? '1px solid var(--relay-hairline)' : 'none',
                    background: 'var(--relay-accent-50)',
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--relay-accent-100)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'var(--relay-accent-50)')}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: 'var(--relay-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name="cal" size={13} style={{ color: '#fff' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--relay-accent-800)', lineHeight: 1.3 }}>
                      Jump to {MONTH_FULL[dateQuery.month]}{dateQuery.day !== undefined ? ` ${dateQuery.day}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--relay-accent-700)', lineHeight: 1.3 }}>
                      {patientSuggestions.length > 0 ? `${patientSuggestions.length} appointment${patientSuggestions.length !== 1 ? 's' : ''} shown below` : 'Navigate to this date'}
                    </div>
                  </div>
                  <Icon name="arrow" size={11} style={{ color: 'var(--relay-accent-700)', flexShrink: 0 }} />
                </div>
              )}
              {patientSuggestions.map((e, i) => {
                const colors = PROVIDER_COLORS[e.provider] ?? FALLBACK_COLOR;
                const nameIdx = e.patient.toLowerCase().indexOf(trimmedSearch);
                const isDateMatch = dateQuery !== null && !e.patient.toLowerCase().includes(trimmedSearch);
                return (
                  <div
                    key={`${e.referralId}-${i}`}
                    onMouseDown={ev => { ev.preventDefault(); jumpToEvent(e); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer',
                      borderBottom: i < patientSuggestions.length - 1 ? '1px solid var(--relay-hairline)' : 'none',
                    }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--relay-tint)')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: colors.bg, border: `1px solid ${colors.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10.5, fontWeight: 700, color: colors.fg,
                    }}>
                      {e.patient.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--relay-ink)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isDateMatch ? e.patient : nameIdx === -1 ? e.patient : (
                          <>{e.patient.slice(0, nameIdx)}<strong>{e.patient.slice(nameIdx, nameIdx + trimmedSearch.length)}</strong>{e.patient.slice(nameIdx + trimmedSearch.length)}</>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--relay-ink-3)', lineHeight: 1.3, marginTop: 1 }}>
                        {e.day} · {e.time} · {e.provider}
                      </div>
                    </div>
                    <Icon name="arrow" size={11} style={{ color: 'var(--relay-ink-4)', flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <span style={{ flex: 1 }} />

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: 'var(--relay-ink-3)', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'repeating-linear-gradient(45deg,#f8fafb,#f8fafb 2px,#fff 2px,#fff 4px)', border: '1px dashed var(--relay-hairline-strong)', display: 'inline-block', flexShrink: 0 }} />
            Shadow
          </span>
          {providers.map(p => {
            const c = PROVIDER_COLORS[p] ?? FALLBACK_COLOR;
            return (
              <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block', flexShrink: 0 }} />
                {p}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Week view ── */}
      {view === 'week' && (
        <div className="cal-grid" style={{ gridTemplateColumns: '60px repeat(5, 1fr)' }}>
          {/* Header row */}
          <div className="cal-hd" />
          {weekDays.map(day => {
            const today = isSameDay(day, PROTOTYPE_TODAY);
            const count = bookedCountForDay(day);
            return (
              <div
                key={day.toISOString()}
                className="cal-hd"
                style={today ? { background: 'var(--relay-accent-50)' } : undefined}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: today ? 'var(--relay-accent-700)' : 'var(--relay-ink-4)',
                  }}>
                    {DAY_SHORT[day.getDay()]}
                  </span>
                  <span style={{
                    fontSize: 22, fontWeight: 700, lineHeight: 1.1,
                    color: today ? 'var(--relay-accent)' : 'var(--relay-ink)',
                    letterSpacing: '-0.02em',
                  }}>
                    {day.getDate()}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--relay-ink-4)' }}>
                    {MONTH_SHORT[day.getMonth()]}
                  </span>
                </div>
                {count > 0 && (
                  <span style={{
                    alignSelf: 'flex-start', marginTop: 2,
                    fontSize: 10.5, padding: '1px 7px', borderRadius: 9,
                    background: today ? 'var(--relay-accent-100)' : 'var(--relay-tint)',
                    color: today ? 'var(--relay-accent-800)' : 'var(--relay-ink-3)',
                  }}>
                    {count} booked
                  </span>
                )}
              </div>
            );
          })}

          {/* Time rows */}
          {HOUR_SLOTS.map(hour => (
            <React.Fragment key={`row-${hour}`}>
              <div className="cal-cell timecol" style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 8 }}>
                {formatHour(hour)}
              </div>
              {weekDays.map(day => {
                const cellEvents = eventsForCell(day, hour);
                return (
                  <div key={`${hour}-${day.toISOString()}`} className="cal-cell">
                    {cellEvents.map((e, i) => (
                      <ApptChip
                        key={`${e.referralId}-${i}`}
                        event={e}
                        onClick={!e.isShadow ? () => setActiveModal(e) : undefined}
                        highlighted={highlightedReferralId === e.referralId}
                      />
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Day view ── */}
      {view === 'day' && (
        <>
          {/* Day selector strip — the whole week shown as buttons */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--relay-hairline)' }}>
            {weekDays.map(day => {
              const today = isSameDay(day, PROTOTYPE_TODAY);
              const selected = isSameDay(day, selectedDay);
              const count = bookedCountForDay(day);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '7px 18px', borderRadius: 9, border: '1.5px solid',
                    borderColor: selected ? 'var(--relay-accent)' : today ? 'var(--relay-accent-200)' : 'var(--relay-hairline)',
                    background: selected ? 'var(--relay-accent)' : today ? 'var(--relay-accent-50)' : 'var(--relay-surface)',
                    color: selected ? '#fff' : today ? 'var(--relay-accent-800)' : 'var(--relay-ink)',
                    cursor: 'pointer', fontFamily: 'inherit', gap: 1, flex: 1, minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: selected ? 0.8 : 1 }}>
                    {DAY_SHORT[day.getDay()]}
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                    {day.getDate()}
                  </span>
                  <span style={{ fontSize: 10.5, opacity: 0.65 }}>
                    {count > 0 ? `${count} appt${count !== 1 ? 's' : ''}` : MONTH_SHORT[day.getMonth()]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Day grid — single column */}
          <div className="cal-grid" style={{ gridTemplateColumns: '60px 1fr' }}>
            <div className="cal-hd" />
            <div className="cal-hd" style={isSameDay(selectedDay, PROTOTYPE_TODAY) ? { background: 'var(--relay-accent-50)' } : undefined}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: isSameDay(selectedDay, PROTOTYPE_TODAY) ? 'var(--relay-accent-800)' : 'var(--relay-ink)' }}>
                {DAY_SHORT[selectedDay.getDay()]} {MONTH_FULL[selectedDay.getMonth()]} {selectedDay.getDate()}, {selectedDay.getFullYear()}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--relay-ink-4)' }}>
                {bookedCountForDay(selectedDay)} booked
              </span>
            </div>

            {HOUR_SLOTS.map(hour => (
              <React.Fragment key={`day-${hour}`}>
                <div className="cal-cell timecol" style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 8 }}>
                  {formatHour(hour)}
                </div>
                <div className="cal-cell" style={{ minHeight: 68 }}>
                  {eventsForCell(selectedDay, hour).map((e, i) => (
                    <ApptChip
                      key={`${e.referralId}-${i}`}
                      event={e}
                      onClick={!e.isShadow ? () => setActiveModal(e) : undefined}
                      highlighted={highlightedReferralId === e.referralId}
                    />
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* No-event state */}
          {eventsForDay(selectedDay).length === 0 && (
            <div className="empty-state" style={{ marginTop: 16 }}>
              No bookings on this day
            </div>
          )}
        </>
      )}

      {/* ── Month view ── */}
      {view === 'month' && (() => {
        const grid = getMonthGrid(viewAnchor);
        const DOW_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        return (
          <div>
            {/* Day-of-week header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--relay-hairline)', marginBottom: 0 }}>
              {DOW_LABELS.map(d => (
                <div key={d} style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--relay-ink-4)', textAlign: 'center' }}>
                  {d}
                </div>
              ))}
            </div>
            {/* Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid var(--relay-hairline)', borderTop: 'none', borderRadius: '0 0 var(--relay-radius) var(--relay-radius)', overflow: 'hidden' }}>
              {grid.map(({ date, inMonth }, i) => {
                const isToday = isSameDay(date, PROTOTYPE_TODAY);
                const dayEvts = eventsForDay(date).filter(e => !e.isShadow);
                const total = eventsForDay(date).length;
                return (
                  <div
                    key={i}
                    onClick={() => { setSelectedDay(date); setWeekStart(getWeekStart(date)); switchView('day'); }}
                    style={{
                      minHeight: 90, padding: '6px 8px', cursor: 'pointer',
                      background: isToday ? 'var(--relay-accent-50)' : inMonth ? 'var(--relay-surface)' : 'var(--relay-tint)',
                      borderRight: (i + 1) % 7 !== 0 ? '1px solid var(--relay-hairline)' : 'none',
                      borderBottom: i < grid.length - 7 ? '1px solid var(--relay-hairline)' : 'none',
                    }}
                    onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'var(--relay-tint)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isToday ? 'var(--relay-accent-50)' : inMonth ? 'var(--relay-surface)' : 'var(--relay-tint)'; }}
                  >
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: '50%', marginBottom: 4,
                      fontSize: 12.5, fontWeight: isToday ? 700 : 500,
                      background: isToday ? 'var(--relay-accent)' : 'transparent',
                      color: isToday ? '#fff' : inMonth ? 'var(--relay-ink)' : 'var(--relay-ink-4)',
                    }}>
                      {date.getDate()}
                    </div>
                    {dayEvts.slice(0, 2).map((e, j) => {
                      const c = PROVIDER_COLORS[e.provider] ?? FALLBACK_COLOR;
                      return (
                        <div key={j} style={{
                          fontSize: 11, fontWeight: 500, padding: '1px 5px', borderRadius: 4, marginBottom: 2,
                          background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {e.time} {e.patient}
                        </div>
                      );
                    })}
                    {total > 2 && (
                      <div style={{ fontSize: 10.5, color: 'var(--relay-ink-3)', fontWeight: 500, paddingLeft: 2 }}>
                        +{total - 2} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Year view ── */}
      {view === 'year' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {Array.from({ length: 12 }, (_, mi) => {
            const monthAnchor = new Date(viewAnchor.getFullYear(), mi, 1);
            const grid = getMonthGrid(monthAnchor);
            const DOW = ['M','T','W','T','F','S','S'];
            const monthTotal = filteredEvents.filter(e => {
              const d = parseEventDate(e.day, e.time);
              return d.getFullYear() === viewAnchor.getFullYear() && d.getMonth() === mi && !e.isShadow;
            }).length;
            return (
              <div key={mi} style={{
                background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)',
                borderRadius: 'var(--relay-radius)', overflow: 'hidden',
              }}>
                {/* Mini month header */}
                <div
                  onClick={() => { setViewAnchor(monthAnchor); switchView('month'); }}
                  style={{
                    padding: '8px 10px 6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--relay-hairline)',
                    background: monthAnchor.getMonth() === PROTOTYPE_TODAY.getMonth() && monthAnchor.getFullYear() === PROTOTYPE_TODAY.getFullYear() ? 'var(--relay-accent-50)' : undefined,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--relay-ink)' }}>
                    {MONTH_SHORT[mi]}
                  </span>
                  {monthTotal > 0 && (
                    <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 99, background: 'var(--relay-accent-50)', color: 'var(--relay-accent)', fontWeight: 600 }}>
                      {monthTotal}
                    </span>
                  )}
                </div>
                {/* DOW row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '4px 6px 2px' }}>
                  {DOW.map((d, i) => (
                    <div key={i} style={{ fontSize: 9, color: 'var(--relay-ink-4)', textAlign: 'center', fontWeight: 600 }}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 6px 6px', gap: 2 }}>
                  {grid.map(({ date, inMonth }, ci) => {
                    const isToday = isSameDay(date, PROTOTYPE_TODAY);
                    const dayCount = filteredEvents.filter(e => isSameDay(parseEventDate(e.day, e.time), date) && !e.isShadow).length;
                    return (
                      <div
                        key={ci}
                        onClick={() => { setSelectedDay(date); setWeekStart(getWeekStart(date)); switchView('day'); }}
                        title={dayCount > 0 ? `${dayCount} appointment${dayCount !== 1 ? 's' : ''}` : undefined}
                        style={{
                          height: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 4, cursor: 'pointer', position: 'relative',
                          background: isToday ? 'var(--relay-accent)' : 'transparent',
                        }}
                        onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'var(--relay-tint)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isToday ? 'var(--relay-accent)' : 'transparent'; }}
                      >
                        <span style={{
                          fontSize: 10, lineHeight: 1,
                          color: isToday ? '#fff' : inMonth ? 'var(--relay-ink-2)' : 'var(--relay-ink-4)',
                          fontWeight: isToday ? 700 : 400,
                        }}>
                          {date.getDate()}
                        </span>
                        {dayCount > 0 && !isToday && (
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--relay-accent)', marginTop: 1 }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info strip */}
      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--relay-tint)', border: '1px solid var(--relay-hairline)', borderRadius: 6, fontSize: 12.5, color: 'var(--relay-ink-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="info" size={12} />
        Shadow entries (dashed) are read-only mirror views of AI-captured slots pending MA confirmation. Navigation range: Mar 17, 2026 – Apr 14, 2028.
      </div>

      {/* Event detail modal */}
      {activeModal && (
        <EventModal
          event={activeModal}
          onClose={() => setActiveModal(null)}
          onSave={handleEventSave}
          onDelete={handleEventDelete}
        />
      )}
    </>
  );
}
