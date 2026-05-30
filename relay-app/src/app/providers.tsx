'use client';

import { ActiveCallProvider } from '@/contexts/ActiveCallContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <ActiveCallProvider>{children}</ActiveCallProvider>;
}
