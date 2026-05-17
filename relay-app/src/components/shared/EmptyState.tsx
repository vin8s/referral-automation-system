'use client';

import { cn } from '@/lib/utils';
import { Icon } from './Icon';

interface EmptyStateProps {
  icon?: string;
  title: string;
  sub?: string;
  className?: string;
}

export function EmptyState({ icon, title, sub, className }: EmptyStateProps) {
  return (
    <div className={cn('empty-state', className)}>
      {icon && (
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--relay-tint)',
          border: '1px solid var(--relay-hairline)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--relay-ink-3)',
          marginBottom: 10,
        }}>
          <Icon name={icon} size={16} />
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--relay-ink-2)' }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 4, maxWidth: 320, textAlign: 'center' }}>{sub}</div>}
    </div>
  );
}
