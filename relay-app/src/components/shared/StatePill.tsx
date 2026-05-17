'use client';

import { cn } from '@/lib/utils';
import type { ReferralState } from '@/lib/types';

// Single color map for all referral states.
// This is the ONLY place state→color mapping lives. Never recolor per-screen.
const STATE_MAP: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  'Ingested':     { bg: 'var(--st-ingested-bg)',  fg: 'var(--st-ingested-fg)',  dot: '#94a3b8', label: 'Ingested' },
  'Queued':       { bg: 'var(--st-queued-bg)',    fg: 'var(--st-queued-fg)',    dot: '#3b82f6', label: 'Queued' },
  'Outreach':     { bg: 'var(--st-outreach-bg)',  fg: 'var(--st-outreach-fg)',  dot: '#0891b2', label: 'Outreach active' },
  'Slot accepted':{ bg: 'var(--st-accepted-bg)',  fg: 'var(--st-accepted-fg)',  dot: '#d97706', label: 'Slot accepted' },
  'Booked':       { bg: 'var(--st-booked-bg)',    fg: 'var(--st-booked-fg)',    dot: '#0d9488', label: 'Booked' },
  'Escalated':    { bg: 'var(--st-escalated-bg)', fg: 'var(--st-escalated-fg)', dot: '#dc2626', label: 'Escalated' },
  'Closed-won':   { bg: 'var(--st-won-bg)',       fg: 'var(--st-won-fg)',       dot: '#059669', label: 'Closed-won' },
  'Closed-lost':  { bg: 'var(--st-lost-bg)',      fg: 'var(--st-lost-fg)',      dot: '#64748b', label: 'Closed-lost' },
};

interface StatePillProps {
  state: ReferralState | string;
  label?: string;
  hideDot?: boolean;
  className?: string;
}

export function StatePill({ state, label, hideDot = false, className }: StatePillProps) {
  const token = STATE_MAP[state] ?? STATE_MAP['Ingested'];
  const displayLabel = label ?? token.label;

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap', className)}
      style={{
        background: token.bg,
        color: token.fg,
        fontSize: 11.5,
        padding: '2px 9px',
        lineHeight: 1.5,
      }}
    >
      {!hideDot && (
        <span
          style={{ width: 6, height: 6, borderRadius: '50%', background: token.dot, opacity: 0.8, flexShrink: 0 }}
        />
      )}
      {displayLabel}
    </span>
  );
}
