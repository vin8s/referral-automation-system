'use client';

import { cn } from '@/lib/utils';
import type { ReferralState } from '@/lib/types';

// Single color map for all referral states.
// This is the ONLY place state→color mapping lives. Never recolor per-screen.
const STATE_MAP: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  'Queued':               { bg: 'var(--st-queued-bg)',    fg: 'var(--st-queued-fg)',    dot: '#3b82f6', label: 'Queued' },
  'In Progress':          { bg: 'var(--st-outreach-bg)',  fg: 'var(--st-outreach-fg)',  dot: '#0891b2', label: 'In Progress' },
  'Pending Confirmation': { bg: 'var(--st-accepted-bg)',  fg: 'var(--st-accepted-fg)',  dot: '#d97706', label: 'Pending Confirmation' },
  'Booked':               { bg: 'var(--st-booked-bg)',    fg: 'var(--st-booked-fg)',    dot: '#0d9488', label: 'Booked' },
  'Escalated':            { bg: 'var(--st-escalated-bg)', fg: 'var(--st-escalated-fg)', dot: '#dc2626', label: 'Escalated' },

};

interface StatePillProps {
  state: ReferralState | string;
  label?: string;
  hideDot?: boolean;
  className?: string;
}

export function StatePill({ state, label, hideDot = false, className }: StatePillProps) {
  const token = STATE_MAP[state] ?? STATE_MAP['Queued'];
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
