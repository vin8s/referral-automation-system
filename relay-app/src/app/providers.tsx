'use client';

import { ActiveCallProvider } from '@/contexts/ActiveCallContext';
import { CallQueueProvider } from '@/contexts/CallQueueContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { CallQueueRunner } from '@/components/shared/CallQueueRunner';
import type { SessionUser } from '@/lib/auth-types';

export function Providers({
  children, user, voiceEnabled,
}: { children: React.ReactNode; user: SessionUser; voiceEnabled: boolean }) {
  return (
    <SessionProvider user={user} voiceEnabled={voiceEnabled}>
      <ActiveCallProvider>
        <CallQueueProvider>
          {children}
          <CallQueueRunner />
        </CallQueueProvider>
      </ActiveCallProvider>
    </SessionProvider>
  );
}
