'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface ActiveCallInfo {
  callId: string;
  referralId: string;
  patientName: string;
}

interface ActiveCallContextValue {
  activeCall: ActiveCallInfo | null;
  setActiveCall: (call: ActiveCallInfo | null) => void;
}

const ActiveCallContext = createContext<ActiveCallContextValue>({
  activeCall: null,
  setActiveCall: () => {},
});

export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  return (
    <ActiveCallContext.Provider value={{ activeCall, setActiveCall }}>
      {children}
    </ActiveCallContext.Provider>
  );
}

export function useActiveCall() {
  return useContext(ActiveCallContext);
}
