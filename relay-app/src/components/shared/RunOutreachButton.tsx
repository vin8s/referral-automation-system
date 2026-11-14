'use client';

// "Run outreach now": sends texts that are due right now (same as one scheduler tick).
// Admin-only, development only. In production AWS EventBridge runs outreach on a schedule.
// Renders nothing for MAs or in production.

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useSession } from '@/contexts/SessionContext';
import { getOutreachSettings, runOutreachNow } from '@/lib/data';
import type { OutreachTickResult } from '@/lib/types';

export function RunOutreachButton({ onDone }: { onDone?: () => void }) {
  const { isAdmin } = useSession();
  const [devTools, setDevTools] = useState(false);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState<OutreachTickResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    getOutreachSettings().then(v => setDevTools(v.devTools)).catch(() => setDevTools(false));
  }, [isAdmin]);

  if (!isAdmin || !devTools) return null;

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setTick(await runOutreachNow());
      onDone?.();
    } catch {
      setError('Outreach could not run. Try again.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button className="btn btn-go btn-lg" onClick={run} disabled={running}>
        <Icon name="sms" size={16} /> {running ? 'Running outreach…' : 'Run outreach now'}
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: 'var(--st-escalated-fg)' }}>{error}</span>
      ) : tick ? (
        <span role="status" style={{ fontSize: 12, color: 'var(--relay-ink-3)', maxWidth: 420, textAlign: 'right' }}>
          {tick.paused
            ? 'Texting is paused — nothing sent.'
            : `${tick.sent} sent · ${tick.heldReleased} held released · ${tick.amber} new needs-a-human${tick.inWindow ? '' : ' · outside the sending window'}`}
          {Object.keys(tick.skipped).length > 0 && (
            <span style={{ color: 'var(--relay-ink-4)' }}> · skipped: {Object.entries(tick.skipped).map(([k, v]) => `${k} (${v})`).join(', ')}</span>
          )}
        </span>
      ) : null}
    </div>
  );
}
