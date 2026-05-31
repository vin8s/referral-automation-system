'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
import { StatePill } from '@/components/shared/StatePill';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { getReferrals } from '@/lib/data';
import type { Referral } from '@/lib/types';

// ── Notification types ────────────────────────────────────────────────────────

type NotifKind = 'slot_captured' | 'escalation' | 'high_attempts' | 'batch_ingested' | 'slot_confirmed' | 'aging' | 'blocked';

interface Notification {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  time: string;
  href: string;
  read: boolean;
}

const KIND_ICON: Record<NotifKind, string> = {
  slot_captured:  'cal',
  escalation:     'alert',
  high_attempts:  'phone',
  batch_ingested: 'upload',
  slot_confirmed: 'check',
  aging:          'history',
  blocked:        'x',
};

const KIND_COLOR: Record<NotifKind, string> = {
  slot_captured:  'var(--relay-accent)',
  escalation:     'var(--relay-urgent)',
  high_attempts:  '#d97706',
  batch_ingested: 'var(--relay-accent)',
  slot_confirmed: '#16a34a',
  aging:          '#d97706',
  blocked:        '#b91c1c',
};

const KIND_BG: Record<NotifKind, string> = {
  slot_captured:  'var(--relay-accent-50)',
  escalation:     'var(--relay-urgent-50)',
  high_attempts:  '#fffbeb',
  batch_ingested: 'var(--relay-accent-50)',
  slot_confirmed: '#f0fdf4',
  aging:          '#fffbeb',
  blocked:        '#fff1f2',
};

function deriveNotifications(referrals: Referral[]): Notification[] {
  const notifs: Notification[] = [];

  // Slot captured → needs confirmation
  referrals
    .filter(r => r.state === 'Pending Confirmation' && r.capturedSlot)
    .forEach(r => {
      notifs.push({
        id: `slot_captured_${r.id}`,
        kind: 'slot_captured',
        title: 'Slot captured — confirm required',
        body: `${r.patient.name} · ${r.capturedSlot!.day} ${r.capturedSlot!.time} with ${r.capturedSlot!.provider}`,
        time: r.attempts[r.attempts.length - 1]?.timestamp ?? r.referralTime,
        href: '/action',
        read: false,
      });
    });

  // Escalations
  referrals
    .filter(r => r.state === 'Escalated' && r.escalation)
    .forEach(r => {
      notifs.push({
        id: `escalation_${r.id}`,
        kind: 'escalation',
        title: 'Escalation raised',
        body: `${r.patient.name} — ${r.escalation!.reason}`,
        time: r.escalation!.raisedAt,
        href: '/alerts',
        read: false,
      });
    });

  // High attempt count (3+ with no booking)
  referrals
    .filter(r => r.attempts.length >= 3 && r.state === 'In Progress')
    .forEach(r => {
      notifs.push({
        id: `high_attempts_${r.id}`,
        kind: 'high_attempts',
        title: `${r.attempts.length} attempts — no booking yet`,
        body: `${r.patient.name} · ${r.reason} · consider manual outreach`,
        time: r.attempts[r.attempts.length - 1]?.timestamp ?? r.referralTime,
        href: `/referrals/${r.id}`,
        read: false,
      });
    });

  // Confirmed slots (recent Booked referrals)
  referrals
    .filter(r => r.state === 'Booked' && r.bookedAppointment)
    .slice(0, 3)
    .forEach(r => {
      notifs.push({
        id: `confirmed_${r.id}`,
        kind: 'slot_confirmed',
        title: 'Appointment confirmed',
        body: `${r.patient.name} · ${r.bookedAppointment!.day} ${r.bookedAppointment!.time} with ${r.bookedAppointment!.provider}`,
        time: r.bookedAppointment!.confirmedAt,
        href: `/referrals/${r.id}`,
        read: true,
      });
    });

  // Aging queued referrals with no attempts
  const agingQueued = referrals.filter(r => r.state === 'Queued' && r.attempts.length === 0);
  if (agingQueued.length > 0) {
    notifs.push({
      id: 'aging_queued',
      kind: 'aging',
      title: `${agingQueued.length} referral${agingQueued.length !== 1 ? 's' : ''} queued with no outreach started`,
      body: agingQueued.slice(0, 3).map(r => r.patient.name).join(', ') + (agingQueued.length > 3 ? ` +${agingQueued.length - 3} more` : ''),
      time: agingQueued[0].referralTime,
      href: '/referrals?q=',
      read: false,
    });
  }

  // Blocked: opt-out / wrong number / disconnected
  const blocked = referrals.filter(r =>
    r.attempts.some(a => a.outcome === 'Wrong Number' || a.outcome === 'Disconnected')
  );
  if (blocked.length > 0) {
    notifs.push({
      id: 'blocked_outreach',
      kind: 'blocked',
      title: `${blocked.length} referral${blocked.length !== 1 ? 's' : ''} with blocked outreach`,
      body: blocked.slice(0, 2).map(r => r.patient.name).join(', ') + ' — wrong number or disconnected',
      time: blocked[0].attempts[blocked[0].attempts.length - 1]?.timestamp ?? '',
      href: '/referrals',
      read: true,
    });
  }

  // Sort: unread first, then by time descending (approximate — string compare works for our format)
  return notifs.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.time.localeCompare(a.time);
  });
}

// ── Notification panel ────────────────────────────────────────────────────────

function NotificationPanel({
  notifs,
  onMarkAllRead,
  onMarkRead,
  onClose,
}: {
  notifs: Notification[];
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const unread = notifs.filter(n => !n.read).length;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 700,
        width: 380,
        background: 'var(--relay-surface)',
        border: '1px solid var(--relay-hairline)',
        borderRadius: 'var(--relay-radius)',
        boxShadow: '0 8px 24px rgba(0,0,0,.12)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--relay-hairline)' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--relay-ink)' }}>Notifications</span>
          {unread > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: 'var(--relay-accent)', color: '#fff', borderRadius: 99, padding: '1px 6px' }}>
              {unread} new
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            className="btn-link"
            style={{ fontSize: 12, marginRight: 12 }}
            onClick={onMarkAllRead}
          >
            Mark all read
          </button>
        )}
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--relay-ink-3)', display: 'flex', padding: 2 }}
        >
          <Icon name="x" size={13} />
        </button>
      </div>

      {/* List */}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {notifs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--relay-ink-3)' }}>
            <Icon name="check" size={20} />
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500 }}>You&apos;re all caught up</div>
          </div>
        ) : (
          notifs.map((n, i) => (
            <div
              key={n.id}
              onClick={() => {
                onMarkRead(n.id);
                onClose();
                router.push(n.href);
              }}
              style={{
                display: 'flex', gap: 12, padding: '12px 16px', cursor: 'pointer',
                background: n.read ? 'transparent' : 'var(--relay-tint)',
                borderBottom: i < notifs.length - 1 ? '1px solid var(--relay-hairline)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--relay-accent-50)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = n.read ? 'transparent' : 'var(--relay-tint)'; }}
            >
              {/* Icon */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: KIND_BG[n.kind],
                display: 'grid', placeItems: 'center',
                color: KIND_COLOR[n.kind],
              }}>
                <Icon name={KIND_ICON[n.kind]} size={14} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: n.read ? 500 : 600, color: 'var(--relay-ink)', lineHeight: 1.3 }}>
                    {n.title}
                  </span>
                  {!n.read && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--relay-accent)', flexShrink: 0, marginTop: 1 }} />
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.body}
                </div>
                {n.time && (
                  <div style={{ fontSize: 11, color: 'var(--relay-ink-4)', marginTop: 3 }}>{n.time}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {notifs.length > 0 && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--relay-hairline)', textAlign: 'center' }}>
          <Link
            href="/alerts"
            onClick={onClose}
            style={{ fontSize: 12.5, color: 'var(--relay-accent)', fontWeight: 500, textDecoration: 'none' }}
          >
            View all alerts <Icon name="arrow" size={11} />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── TopBar search ─────────────────────────────────────────────────────────────

function TopBarSearch({ onOpenPalette }: { onOpenPalette: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (pathname === '/referrals') {
      setQuery(searchParams.get('q') ?? '');
    } else {
      setQuery('');
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);


  function fetchOnce() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    getReferrals().then(setReferrals);
  }

  const trimmed = query.trim().toLowerCase();
  const suggestions = trimmed.length < 1 ? [] : referrals
    .filter(r => r.patient.name.toLowerCase().includes(trimmed))
    .slice(0, 6);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setActiveIdx(-1);
    setOpen(true);
  }

  function handleFocus() {
    fetchOnce();
    if (query.trim()) setOpen(true);
  }

  function commit(r: Referral) {
    setOpen(false);
    setActiveIdx(-1);
    setQuery(r.patient.name);
    router.push(`/referrals/${r.id}`);
  }

  function runSearch() {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/referrals?q=${encodeURIComponent(query.trim())}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && suggestions[activeIdx]) commit(suggestions[activeIdx]);
      else runSearch();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
      if (!query) {
        inputRef.current?.blur();
      } else {
        setQuery('');
        if (pathname === '/referrals') router.push('/referrals');
      }
    }
  }

  function highlight(text: string) {
    if (!trimmed) return text;
    const idx = text.toLowerCase().indexOf(trimmed);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <strong style={{ color: 'var(--relay-ink)' }}>{text.slice(idx, idx + trimmed.length)}</strong>
        {text.slice(idx + trimmed.length)}
      </>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: '0 1 280px' }}>
      <div className="tb-search" style={{ cursor: 'pointer' }} onClick={onOpenPalette}>
        <Icon name="search" size={14} />
        <span style={{ flex: 1, fontSize: 13, color: 'var(--relay-ink-3)', userSelect: 'none' }}>
          Search patients, pages…
        </span>
        <span className="tb-kbd">⌘K</span>
      </div>

    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBarInner() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getReferrals().then(referrals => setNotifs(deriveNotifications(referrals)));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = useCallback(() => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  return (
    <div className="tb">
      {paletteOpen && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
      <Suspense fallback={
        <div className="tb-search" style={{ flex: '0 1 280px' }}>
          <Icon name="search" size={14} />
          <input placeholder="Search patients by name…" aria-label="Search" />
          <span className="tb-kbd">⌘K</span>
        </div>
      }>
        <TopBarSearch onOpenPalette={() => setPaletteOpen(true)} />
      </Suspense>

      <div className="tb-right">


        <div ref={bellRef} style={{ position: 'relative' }}>
          <button
            className="tb-iconbtn"
            aria-label="Notifications"
            onClick={() => setPanelOpen(o => !o)}
            style={{ position: 'relative' }}
          >
            <Icon name="bell" size={15} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 3, right: 3,
                width: unreadCount > 9 ? 16 : 14, height: 14,
                borderRadius: 99, background: 'var(--relay-urgent)',
                color: '#fff', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, border: '1.5px solid var(--relay-surface)',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {panelOpen && (
            <NotificationPanel
              notifs={notifs}
              onMarkAllRead={markAllRead}
              onMarkRead={markRead}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>

        <button className="tb-avatar" title="Priya N. — Medical assistant" aria-label="Account">
          P
        </button>
      </div>
    </div>
  );
}

export function TopBar() {
  return (
    <Suspense fallback={
      <div className="tb">
        <div className="tb-search" style={{ flex: '0 1 280px' }}>
          <Icon name="search" size={14} />
          <input placeholder="Search patients by name…" aria-label="Search" />
          <span className="tb-kbd">⌘K</span>
        </div>
      </div>
    }>
      <TopBarInner />
    </Suspense>
  );
}
