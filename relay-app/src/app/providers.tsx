'use client';

import { SessionProvider } from '@/contexts/SessionContext';
import type { SessionUser } from '@/lib/auth-types';

export function Providers({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  return <SessionProvider user={user}>{children}</SessionProvider>;
}
