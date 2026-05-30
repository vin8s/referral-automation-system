'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useActiveCall } from '@/contexts/ActiveCallContext';

export function ActiveCallBanner() {
  const { activeCall } = useActiveCall();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeCall) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [activeCall]);

  if (!activeCall) return null;

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const duration = m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;

  return (
    <div style={{
      background: 'var(--relay-accent-800)',
      color: '#fff',
      padding: '7px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 12.5,
      fontWeight: 500,
      flexShrink: 0,
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#4ade80',
        flexShrink: 0,
        boxShadow: '0 0 0 0 rgba(74,222,128,0.6)',
        animation: 'pulse-dot 1.4s ease infinite',
      }} />
      <span style={{ color: 'rgba(255,255,255,0.75)' }}>Voice call in progress</span>
      <span style={{ color: '#fff' }}>·</span>
      <Link
        href={`/referrals/${activeCall.referralId}`}
        style={{ color: '#fff', fontWeight: 600, textDecoration: 'none' }}
      >
        {activeCall.patientName}
      </Link>
      <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>{duration}</span>
    </div>
  );
}
