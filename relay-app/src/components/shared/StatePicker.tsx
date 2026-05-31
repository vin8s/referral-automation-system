'use client';

import { useState, useEffect, useRef } from 'react';
import { StatePill } from './StatePill';
import { Icon } from './Icon';
import { updateReferralState } from '@/lib/data';
import type { ReferralState } from '@/lib/types';

const ALL_STATES: ReferralState[] = [
  'Queued', 'In Progress', 'Attempted', 'Pending Confirmation', 'Booked', 'Escalated',
];

interface StatePickerProps {
  referralId: string;
  current: ReferralState;
  onChange: (id: string, next: ReferralState) => void;
}

export function StatePicker({ referralId, current, onChange }: StatePickerProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function pick(next: ReferralState) {
    if (next === current) { setOpen(false); return; }
    setSaving(true);
    await updateReferralState(referralId, next);
    onChange(referralId, next);
    setSaving(false);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
        title="Change state"
      >
        <StatePill state={current} />
        <Icon name="chevron" size={10} style={{ color: 'var(--relay-ink-4)', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: 'var(--relay-surface)',
          border: '1px solid var(--relay-hairline)',
          borderRadius: 8, boxShadow: 'var(--relay-shadow-pop)',
          padding: 6, minWidth: 170,
        }}>
          <div style={{ fontSize: 10.5, color: 'var(--relay-ink-4)', padding: '2px 6px 6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Change state
          </div>
          {ALL_STATES.map(s => (
            <button
              key={s}
              onClick={() => pick(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '5px 6px', border: 'none', borderRadius: 5,
                background: s === current ? 'var(--relay-tint)' : 'transparent',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <StatePill state={s} />
              {s === current && (
                <Icon name="check" size={11} style={{ color: 'var(--relay-accent)', marginLeft: 'auto' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
