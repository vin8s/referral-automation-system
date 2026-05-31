'use client';

import { createContext, useContext, useState } from 'react';

interface CallQueueContextValue {
  isOpen: boolean;
  openQueue: () => void;
  closeQueue: () => void;
}

const CallQueueContext = createContext<CallQueueContextValue>({
  isOpen: false,
  openQueue: () => {},
  closeQueue: () => {},
});

export function CallQueueProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <CallQueueContext.Provider value={{ isOpen, openQueue: () => setIsOpen(true), closeQueue: () => setIsOpen(false) }}>
      {children}
    </CallQueueContext.Provider>
  );
}

export function useCallQueue() {
  return useContext(CallQueueContext);
}
