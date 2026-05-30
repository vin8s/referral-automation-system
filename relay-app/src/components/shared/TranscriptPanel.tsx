'use client';

import { cn } from '@/lib/utils';
import type { TranscriptTurn } from '@/lib/types';

interface TranscriptData {
  turns?: TranscriptTurn[];
  patient?: string;
  call?: string;
  disclosure?: boolean;
  summary?: string;
}

interface TranscriptPanelProps {
  data?: TranscriptData;
  className?: string;
}

export function TranscriptPanel({ data, className }: TranscriptPanelProps) {
  const turns = data?.turns ?? [];

  if (!data || turns.length === 0) {
    return (
      <div className={cn('transcript', className)} style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
        No transcript data available for this attempt.
      </div>
    );
  }

  return (
    <div className={cn('transcript', className)}>
      <div>
        {turns.map((turn, i) => (
          <div key={i} className="turn">
            <div className={cn('turn-speaker', turn.who === 'ai' && 'ai')}>
              {turn.who === 'ai' ? 'AI' : 'Patient'}
            </div>
            <div className="turn-text">{turn.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
