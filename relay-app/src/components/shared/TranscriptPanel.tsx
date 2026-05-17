'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import type { TranscriptTurn } from '@/lib/types';

interface TranscriptData {
  patient?: string;
  call?: string;
  disclosure?: boolean;
  summary?: string;
  turns?: TranscriptTurn[];
}

interface TranscriptPanelProps {
  data?: TranscriptData;
  compact?: boolean;
  className?: string;
}

export function TranscriptPanel({ data, compact, className }: TranscriptPanelProps) {
  const [playing, setPlaying] = useState(false);

  const turns = data?.turns ?? [];
  const summary = data?.summary ?? '';

  return (
    <div className={cn('transcript', className)}>
      {data && (
        <div className="transcript-head">
          <div>
            {data.patient && <div style={{ fontWeight: 600, fontSize: 13 }}>{data.patient}</div>}
            {data.call && <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 2 }}>{data.call}</div>}
          </div>
          {data.disclosure !== undefined && (
            <span style={{
              fontSize: 11,
              background: data.disclosure ? 'var(--st-booked-bg)' : 'var(--relay-tint)',
              color: data.disclosure ? 'var(--st-booked-fg)' : 'var(--relay-ink-3)',
              padding: '2px 8px',
              borderRadius: 99,
              fontWeight: 500,
              flexShrink: 0,
            }}>
              {data.disclosure ? 'Disclosure played' : 'No disclosure'}
            </span>
          )}
        </div>
      )}

      {summary && (
        <div className="transcript-summary">
          <span style={{ fontWeight: 600 }}>AI summary · </span>
          {summary}
        </div>
      )}

      {!compact && turns.length > 0 && (
        <>
          <div className="scrubber" style={{ marginTop: 12 }}>
            <button
              style={{ color: 'var(--relay-accent)', lineHeight: 0 }}
              onClick={() => setPlaying(p => !p)}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <Icon name={playing ? 'pause' : 'play'} size={14} />
            </button>
            <div className="scrubber-bar" style={{ flex: 1, height: 4, background: 'var(--relay-ink-5)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
              <div className="scrubber-fill" style={{ position: 'absolute', inset: '0 auto 0 0', width: '38%', background: 'var(--relay-accent)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--relay-ink-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>0:38 / 1:42</span>
          </div>

          <div style={{ marginTop: 8 }}>
            {turns.map((turn, i) => (
              <div key={i} className="turn">
                <div className={cn('turn-speaker', turn.who === 'ai' && 'ai')}>
                  {turn.who === 'ai' ? 'AI' : 'Patient'}
                </div>
                <div className="turn-text">{turn.text}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {compact && summary && turns.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 6 }}>
          Voice transcript available in detail view.
        </div>
      )}

      {!data && (
        <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
          No transcript data available for this attempt.
        </div>
      )}
    </div>
  );
}
