'use client';

import { cn } from '@/lib/utils';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const dims = { sm: 24, md: 28, lg: 40 };
  const fonts = { sm: 10, md: 11, lg: 14 };
  const d = dims[size];
  const f = fonts[size];

  return (
    <span
      className={cn('inline-grid place-items-center rounded-full flex-shrink-0 font-semibold', className)}
      style={{
        width: d, height: d, fontSize: f,
        background: 'var(--relay-tint)',
        border: '1px solid var(--relay-hairline)',
        color: 'var(--relay-ink-2)',
      }}
    >
      {initials(name)}
    </span>
  );
}
