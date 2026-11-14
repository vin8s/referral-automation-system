'use client';

// Signed-in user, provided by app/(app)/layout.tsx.

import { createContext, useContext } from 'react';
import type { SessionUser } from '@/lib/auth-types';

interface SessionContextValue {
  user: SessionUser;
  isAdmin: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  user, children,
}: { user: SessionUser; children: React.ReactNode }) {
  return (
    <SessionContext.Provider value={{ user, isAdmin: user.role === 'admin' }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
