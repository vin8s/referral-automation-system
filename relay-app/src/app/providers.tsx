'use client';

import { ActiveCallProvider } from '@/contexts/ActiveCallContext';
import { CallQueueProvider } from '@/contexts/CallQueueContext';
import { CallQueueRunner } from '@/components/shared/CallQueueRunner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ActiveCallProvider>
      <CallQueueProvider>
        {children}
        <CallQueueRunner />
      </CallQueueProvider>
    </ActiveCallProvider>
  );
}
