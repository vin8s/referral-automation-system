'use client';

// SMS conversation bubbles. Used on the referral detail (full thread) and on
// confirm-queue cards (excerpt). Patient on the left, clinic on the right; each
// outbound text is tagged Template / AI / Staff and shows its delivery status.

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { SmsMessage } from '@/lib/types';

const AUTHOR_LABEL: Record<SmsMessage['author'], string> = {
  patient: 'Patient', template: 'Template', ai: 'AI', staff: 'Staff', system: 'System',
};

function statusChip(m: SmsMessage) {
  if (m.direction === 'inbound') return null;
  switch (m.status) {
    case 'held': return <span className="sms-chip held" title="Quiet hours: sends at the next allowed time">Held · {m.sendAfter}</span>;
    case 'suppressed': return <span className="sms-chip bad" title={m.note ?? undefined}>Not sent{m.note ? ` · ${m.note}` : ''}</span>;
    case 'failed': return <span className="sms-chip bad">Failed</span>;
    case 'delivered': return <span>Delivered</span>;
    case 'sent': return <span>Sent</span>;
    default: return <span>Sending…</span>;
  }
}

export function SmsThread({
  messages, maxHeight = 420, emptyText = 'No texts yet.', compact = false,
}: { messages: SmsMessage[]; maxHeight?: number; emptyText?: string; compact?: boolean }) {
  // Keep the newest text in view (scroll the thread box only, never the page).
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [messages.length]);

  if (messages.length === 0) {
    return <div className="sms-thread" style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>{emptyText}</div>;
  }
  return (
    <div ref={box} className="sms-thread" style={{ maxHeight }} aria-label="SMS conversation">
      {messages.map(m => {
        const out = m.direction === 'outbound';
        return (
          <div
            key={m.id}
            className={cn('sms-row', out ? 'out' : 'in', m.author === 'staff' && 'staff', (m.status === 'suppressed' || m.status === 'failed') && 'muted')}
          >
            <div className="sms-bubble">{m.body}</div>
            <div className="sms-meta">
              <span className={cn('sms-chip', m.author === 'ai' && 'ai')}>
                {AUTHOR_LABEL[m.author]}{m.author === 'staff' && m.sentBy ? ` · ${m.sentBy}` : ''}
              </span>
              {!compact && m.templateKey && <span>{m.templateKey.replaceAll('_', ' ')}</span>}
              <span>{m.at}</span>
              {statusChip(m)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
