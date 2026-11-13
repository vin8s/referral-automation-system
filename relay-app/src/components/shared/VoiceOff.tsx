'use client';

// Shared "voice is off" affordances. When the server has VOICE_ENABLED=false,
// call actions render disabled with this short note instead of failing silently.

import { Icon } from './Icon';
import { useSession } from '@/contexts/SessionContext';
import { useCallQueue } from '@/contexts/CallQueueContext';

export const VOICE_OFF_TEXT = 'Voice is off for the pilot';

export function VoiceOffNote({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 11.5, color: 'var(--relay-ink-3)', whiteSpace: 'nowrap', ...style,
      }}
    >
      <Icon name="info" size={12} /> {VOICE_OFF_TEXT}
    </span>
  );
}

/** "Run Queue" header action (Dashboard, Referrals). Disabled when voice is off. */
export function RunQueueButton() {
  const { voiceEnabled } = useSession();
  const { openQueue } = useCallQueue();
  if (!voiceEnabled) {
    return (
      <>
        <VoiceOffNote />
        <button className="btn btn-sm btn-primary" disabled aria-disabled title={VOICE_OFF_TEXT} style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          <Icon name="phone" size={12} /> Run Queue
        </button>
      </>
    );
  }
  return (
    <button className="btn btn-sm btn-primary" onClick={openQueue}>
      <Icon name="phone" size={12} /> Run Queue
    </button>
  );
}
