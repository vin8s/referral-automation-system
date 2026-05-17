'use client';

import { cn } from '@/lib/utils';

interface FunnelStep {
  label: string;
  n: number;
  conv: number | null;
}

interface FunnelProps {
  steps: FunnelStep[];
  className?: string;
}

export function Funnel({ steps, className }: FunnelProps) {
  const max = Math.max(...steps.map(s => s.n));

  return (
    <div className={cn('funnel', className)}>
      {steps.map((step, i) => {
        const barPct = max > 0 ? (step.n / max) * 100 : 0;
        const faded = i > 0 && step.n < (steps[i - 1]?.n ?? step.n);
        return (
          <div key={step.label} className={cn('funnel-step', faded && 'faded')}>
            <div className="lbl">{step.label}</div>
            <div className="n">{step.n}</div>
            {step.conv !== null ? (
              <div className="pct">{step.conv}% conv.</div>
            ) : (
              <div className="pct">&nbsp;</div>
            )}
            <div
              className="funnel-bar"
              style={{ width: `${barPct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
