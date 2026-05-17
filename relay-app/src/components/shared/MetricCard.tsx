'use client';

import { cn } from '@/lib/utils';
import { Icon } from './Icon';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDir?: 'up' | 'down' | '';
  spark?: number[];
  className?: string;
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="metric-spark"
      aria-hidden
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MetricCard({ label, value, unit, delta, deltaDir, spark, className }: MetricCardProps) {
  const deltaClass =
    deltaDir === 'up' ? 'delta-up' :
    deltaDir === 'down' ? 'delta-down' :
    '';

  return (
    <div className={cn('relay-card metric', className)}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {delta && (
        <div className={cn('metric-delta', deltaClass)}>
          {deltaDir === 'up' && <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><Icon name="arrow" size={11} /></span>}
          {deltaDir === 'down' && <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}><Icon name="arrow" size={11} /></span>}
          {delta}
        </div>
      )}
      {spark && spark.length > 1 && <Sparkline data={spark} />}
    </div>
  );
}
