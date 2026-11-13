'use client';

// Signed-in user + server feature flags, provided by app/(app)/layout.tsx.

import { createContext, useContext } from 'react';
import type { SessionUser } from '@/lib/auth-types';

interface SessionContextValue {
  user: SessionUser;
  isAdmin: boolean;
  /** VOICE_ENABLED on the server. When false, call actions render disabled. */
  voiceEnabled: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  user, voiceEnabled, children,
}: { user: SessionUser; voiceEnabled: boolean; children: React.ReactNode }) {
  return (
    <SessionContext.Provider value={{ user, voiceEnabled, isAdmin: user.role === 'admin' }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
