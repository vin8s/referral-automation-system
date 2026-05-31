'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface CallQueueContextValue {
  isOpen: boolean;
  minimized: boolean;
  openQueue: () => void;
  closeQueue: () => void;
  setMinimized: (v: boolean) => void;
  toggleQueue: () => void;
}

const CallQueueContext = createContext<CallQueueContextValue>({
  isOpen: false,
  minimized: false,
  openQueue: () => {},
  closeQueue: () => {},
  setMinimized: () => {},
  toggleQueue: () => {},
});

export function CallQueueProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const openQueue = useCallback(() => { setIsOpen(true); setMinimized(false); }, []);
  const closeQueue = useCallback(() => { setIsOpen(false); setMinimized(false); }, []);

  const toggleQueue = useCallback(() => {
    if (!isOpen) {
      setIsOpen(true);
      setMinimized(false);
    } else if (!minimized) {
      setMinimized(true);
    } else {
      setMinimized(false);
    }
  }, [isOpen, minimized]);

  return (
    <CallQueueContext.Provider value={{ isOpen, minimized, openQueue, closeQueue, setMinimized, toggleQueue }}>
      {children}
    </CallQueueContext.Provider>
  );
}

export function useCallQueue() {
  return useContext(CallQueueContext);
}
