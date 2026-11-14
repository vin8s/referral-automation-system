'use client';

// What an eCW row will do (or did). Colors reuse the state tokens of the state the
// referral ends up in (Booked teal, In Progress outreach), and the soft amber
// "needs a human" treatment for review rows. Never the red Escalated colors.

import type { EcwAction } from '@/lib/types';

const STYLE: Record<EcwAction, { bg: string; fg: string; border?: string }> = {
  book:                { bg: 'var(--st-booked-bg)',   fg: 'var(--st-booked-fg)' },
  update_time:         { bg: 'var(--st-booked-bg)',   fg: 'var(--st-booked-fg)' },
  record_visit:        { bg: 'var(--st-booked-bg)',   fg: 'var(--st-booked-fg)' },
  reenter_cancelled:   { bg: 'var(--st-outreach-bg)', fg: 'var(--st-outreach-fg)' },
  reenter_no_show:     { bg: 'var(--st-outreach-bg)', fg: 'var(--st-outreach-fg)' },
  reenter_rescheduled: { bg: 'var(--st-outreach-bg)', fg: 'var(--st-outreach-fg)' },
  review:              { bg: 'var(--relay-urgent-100)', fg: 'var(--relay-urgent-700)' },
  none:                { bg: 'var(--relay-tint)', fg: 'var(--relay-ink-3)', border: 'var(--relay-hairline)' },
  ignore:              { bg: 'var(--relay-tint)', fg: 'var(--relay-ink-4)', border: 'var(--relay-hairline)' },
  invalid:             { bg: 'var(--relay-tint)', fg: 'var(--relay-ink-3)', border: 'var(--relay-hairline-strong)' },
};

export function ActionTag({ action, label }: { action: EcwAction; label: string }) {
  const s = STYLE[action];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, padding: '2px 9px',
      borderRadius: 99, background: s.bg, color: s.fg, border: s.border ? `1px solid ${s.border}` : '1px solid transparent',
      whiteSpace: 'nowrap',
    }}>
      {action === 'review' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--relay-urgent)' }} />}
      {label}
    </span>
  );
}
