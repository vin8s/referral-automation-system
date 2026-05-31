'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getReferrals, getSettings } from '@/lib/data';
import { runAndSaveCall, type CallProgress } from '@/lib/callUtils';
import { StatePill } from '@/components/shared/StatePill';
import { Icon } from '@/components/shared/Icon';
import { useCallQueue } from '@/contexts/CallQueueContext';
import type { Referral, CallOutcome, CadenceConfig, CallOrderMode } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionState = 'loading' | 'ready' | 'running' | 'countdown' | 'stopped' | 'done';

interface CallRecord {
  referralId: string;
  patient: string;
  outcome: CallOutcome;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtInterval(mins: number): string {
  return mins < 1 ? `${mins * 60}s` : `${mins}m`;
}

function outcomeColor(outcome: CallOutcome): string {
  if (outcome === 'Appointment Accepted') return 'var(--relay-accent)';
  if (outcome === 'Escalated' || outcome === 'Wrong Number') return 'var(--relay-urgent)';
  if (outcome === 'Voicemail Left' || outcome === 'No Answer') return 'var(--relay-ink-3)';
  return 'var(--relay-ink-2)';
}

// ── Sorting ───────────────────────────────────────────────────────────────────

const CALL_ORDER_LABELS: Record<CallOrderMode, string> = {
  chronological:   'Chronological',
  urgent_first:    'Urgent first',
  most_recent:     'Most recent',
  fewest_attempts: 'Fewest attempts',
};

function refId(r: Referral): number {
  return parseInt(r.id.replace(/\D/g, ''), 10) || 0;
}

function sortByCallOrder(referrals: Referral[], order: CallOrderMode): Referral[] {
  const copy = [...referrals];
  switch (order) {
    case 'chronological':
      return copy.sort((a, b) => refId(a) - refId(b));
    case 'urgent_first':
      return copy.sort((a, b) => {
        const urgA = a.priority === 'urgent' ? 0 : 1;
        const urgB = b.priority === 'urgent' ? 0 : 1;
        if (urgA !== urgB) return urgA - urgB;
        return refId(a) - refId(b);
      });
    case 'most_recent':
      return copy.sort((a, b) => refId(b) - refId(a));
    case 'fewest_attempts':
      return copy.sort((a, b) => {
        if (a.attempts.length !== b.attempts.length) return a.attempts.length - b.attempts.length;
        return refId(a) - refId(b);
      });
  }
}

// ── Drag-to-resize hook ───────────────────────────────────────────────────────

function useResize(initial: { w: number; h: number }) {
  const [size, setSize] = useState(initial);

  const startResizeW = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = size.w;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(380, Math.min(window.innerWidth - 72, startW + (startX - ev.clientX)));
      setSize(s => ({ ...s, w: next }));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size.w]);

  const startResizeH = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = size.h;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(300, Math.min(window.innerHeight - 72, startH + (startY - ev.clientY)));
      setSize(s => ({ ...s, h: next }));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size.h]);

  const startResizeCorner = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX; const startY = e.clientY;
    const startW = size.w; const startH = size.h;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(380, Math.min(window.innerWidth - 72, startW + (startX - ev.clientX)));
      const h = Math.max(300, Math.min(window.innerHeight - 72, startH + (startY - ev.clientY)));
      setSize({ w, h });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size.w, size.h]);

  return { size, startResizeW, startResizeH, startResizeCorner };
}

// ── Main component ────────────────────────────────────────────────────────────

export function CallQueueRunner() {
  const { isOpen, closeQueue } = useCallQueue();
  const [minimized, setMinimized] = useState(false);
  const { size, startResizeW, startResizeH, startResizeCorner } = useResize({ w: 480, h: 560 });
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [cadence, setCadence] = useState<CadenceConfig>({ intervalMinutes: 5, maxCallsPerSession: 10, callOrder: 'chronological' });
  const [queue, setQueue] = useState<Referral[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [callPhase, setCallPhase] = useState<CallProgress['phase']>('initiating');
  const [completed, setCompleted] = useState<CallRecord[]>([]);
  const [countdown, setCountdown] = useState(0);
  const stopRef = useRef<{ aborted: boolean }>({ aborted: false });
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset and reload when opened
  useEffect(() => {
    if (!isOpen) return;
    setMinimized(false);
    setSessionState('loading');
    setCurrentIdx(0);
    setCompleted([]);
    setCountdown(0);
    stopRef.current.aborted = false;
    Promise.all([getSettings(), getReferrals()]).then(([settings, referrals]) => {
      setCadence(settings.cadence);
      const eligible = referrals.filter(r =>
        r.state === 'Queued' || r.state === 'In Progress'
      );
      const sorted = sortByCallOrder(eligible, settings.cadence.callOrder);
      setQueue(sorted.slice(0, settings.cadence.maxCallsPerSession));
      setSessionState('ready');
    });
  }, [isOpen]);

  const startCountdown = useCallback((secs: number, onDone: () => void) => {
    setCountdown(secs);
    setSessionState('countdown');
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const runQueue = useCallback(async (startIdx: number, currentQueue: Referral[], currentCadence: CadenceConfig) => {
    for (let i = startIdx; i < currentQueue.length; i++) {
      if (stopRef.current.aborted) break;

      setCurrentIdx(i);
      setSessionState('running');
      setCallPhase('initiating');

      const referral = currentQueue[i];
      try {
        const result = await runAndSaveCall(
          referral,
          p => setCallPhase(p.phase),
          stopRef.current,
        );
        setCompleted(prev => [...prev, { referralId: referral.id, patient: referral.patient.name, outcome: result.outcome }]);
      } catch {
        setCompleted(prev => [...prev, { referralId: referral.id, patient: referral.patient.name, outcome: 'No Answer' }]);
      }

      if (stopRef.current.aborted) break;

      if (i < currentQueue.length - 1) {
        await new Promise<void>(resolve => {
          startCountdown(currentCadence.intervalMinutes * 60, resolve);
        });
      }
    }

    if (!stopRef.current.aborted) setSessionState('done');
    else setSessionState('stopped');
  }, [startCountdown]);

  function handleStart() {
    stopRef.current.aborted = false;
    runQueue(0, queue, cadence);
  }

  function handleStop() {
    stopRef.current.aborted = true;
    if (countdownRef.current) clearInterval(countdownRef.current);
    setSessionState('stopped');
  }

  function skipCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(0);
  }

  function handleClose() {
    stopRef.current.aborted = true;
    if (countdownRef.current) clearInterval(countdownRef.current);
    closeQueue();
  }

  if (!isOpen) return null;

  const router = useRouter();
  const isSessionActive = sessionState === 'running' || sessionState === 'countdown';
  const currentReferral = queue[currentIdx];
  const remaining = queue.length - currentIdx - (sessionState === 'done' ? 0 : 1);

  // ── Minimized floating pill ──────────────────────────────────────────────────
  if (minimized) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 900,
        background: 'var(--relay-surface)',
        border: '1.5px solid var(--relay-accent)',
        borderRadius: 50,
        boxShadow: '0 4px 20px rgba(0,0,0,.18)',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px 8px 10px',
        cursor: 'pointer',
      }}
        onClick={() => setMinimized(false)}
      >
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: isSessionActive ? 'var(--relay-accent)' : 'var(--relay-tint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="phone" size={13} />
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--relay-ink)', lineHeight: 1.2 }}>
            {isSessionActive
              ? sessionState === 'countdown'
                ? `Next call in ${formatCountdown(countdown)}`
                : `Calling ${currentReferral?.patient.name ?? '…'}`
              : sessionState === 'done' || sessionState === 'stopped'
              ? `Done · ${completed.length} called`
              : `${queue.length} patients queued`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--relay-ink-3)', lineHeight: 1.2 }}>
            Auto-call queue · click to expand
          </div>
        </div>
        {isSessionActive && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: 'var(--relay-accent)',
            animation: 'pulse 2s infinite',
          }} />
        )}
      </div>
    );
  }

  // ── Full floating panel ──────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 900,
      width: size.w,
      height: size.h,
      background: 'var(--relay-surface)',
      borderRadius: 14,
      boxShadow: '0 16px 48px rgba(0,0,0,.18)',
      border: '1px solid var(--relay-hairline)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Top resize handle */}
      <div
        onMouseDown={startResizeH}
        style={{
          position: 'absolute', top: 0, left: 12, right: 12, height: 6,
          cursor: 'ns-resize', zIndex: 10, borderRadius: '14px 14px 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{ width: 32, height: 3, borderRadius: 99, background: 'var(--relay-hairline)' }} />
      </div>

      {/* Left resize handle */}
      <div
        onMouseDown={startResizeW}
        style={{
          position: 'absolute', top: 12, left: 0, bottom: 12, width: 6,
          cursor: 'ew-resize', zIndex: 10, borderRadius: '14px 0 0 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{ width: 3, height: 32, borderRadius: 99, background: 'var(--relay-hairline)' }} />
      </div>

      {/* Top-left corner handle */}
      <div
        onMouseDown={startResizeCorner}
        style={{
          position: 'absolute', top: 0, left: 0, width: 16, height: 16,
          cursor: 'nwse-resize', zIndex: 11, borderRadius: '14px 0 0 0',
        }}
      />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        paddingTop: 18,
        borderBottom: '1px solid var(--relay-hairline)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'var(--relay-accent-50)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="phone" size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Auto-call queue</div>
          <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', marginTop: 1 }}>
            {sessionState === 'loading' ? 'Loading…'
              : sessionState === 'ready' ? `${queue.length} patients queued · ${fmtInterval(cadence.intervalMinutes)} between calls`
              : sessionState === 'done' || sessionState === 'stopped' ? `Session complete · ${completed.length} called`
              : `${completed.length + 1} of ${queue.length} · ${fmtInterval(cadence.intervalMinutes)} interval`}
          </div>
        </div>
        {isSessionActive && (
          <span style={{
            fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 99,
            background: 'var(--relay-accent-50)', color: 'var(--relay-accent)',
            whiteSpace: 'nowrap',
          }}>
            ● SESSION ACTIVE
          </span>
        )}
        {/* Minimize */}
        <button
          onClick={() => setMinimized(true)}
          title="Minimize"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--relay-ink-3)', display: 'flex', padding: 4 }}
        >
          <Icon name="chevron" size={13} />
        </button>
        {/* Close — only when not actively running */}
        {!isSessionActive && (
          <button
            onClick={handleClose}
            title="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--relay-ink-3)', display: 'flex', padding: 4 }}
          >
            <Icon name="x" size={13} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Loading */}
        {sessionState === 'loading' && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--relay-ink-3)', fontSize: 13 }}>
            Loading queue…
          </div>
        )}

        {/* Ready */}
        {sessionState === 'ready' && (
          <>
            <div style={{
              background: 'var(--relay-tint)', borderRadius: 10,
              padding: '12px 14px', display: 'flex', gap: 24,
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Patients queued</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--relay-ink)' }}>{queue.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Interval</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--relay-ink)' }}>{fmtInterval(cadence.intervalMinutes)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Order</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--relay-ink)', marginTop: 4 }}>
                  {CALL_ORDER_LABELS[cadence.callOrder]}
                </div>
              </div>
            </div>
            {queue.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--relay-ink-3)', fontSize: 13 }}>
                No eligible referrals — queue is empty.
              </div>
            ) : (
              <QueueList queue={queue} currentIdx={-1} completed={[]} onNavigate={id => router.push(`/referrals/${id}`)} />
            )}
          </>
        )}

        {/* Running / countdown */}
        {(sessionState === 'running' || sessionState === 'countdown') && currentReferral && (
          <>
            <CurrentCallCard referral={currentReferral} phase={callPhase} sessionState={sessionState} />

            {sessionState === 'countdown' && (
              <div style={{ background: 'var(--relay-tint)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--relay-ink-2)', fontWeight: 500 }}>Next call in</span>
                  <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--relay-ink)' }}>
                    {formatCountdown(countdown)}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--relay-hairline)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: 'var(--relay-accent)',
                    width: `${(countdown / (cadence.intervalMinutes * 60)) * 100}%`,
                    transition: 'width 1s linear',
                  }} />
                </div>
                {remaining > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 8 }}>
                    {remaining} patient{remaining !== 1 ? 's' : ''} remaining
                  </div>
                )}
                <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={skipCountdown}>
                  Call next now
                </button>
              </div>
            )}

            {queue.length > currentIdx + 1 && (
              <QueueList queue={queue} currentIdx={currentIdx} completed={completed} onNavigate={id => router.push(`/referrals/${id}`)} />
            )}
          </>
        )}

        {/* Done / stopped */}
        {(sessionState === 'done' || sessionState === 'stopped') && (
          <SessionSummary completed={completed} stopped={sessionState === 'stopped'} />
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--relay-hairline)',
        display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
        flexShrink: 0,
      }}>
        {sessionState === 'ready' && queue.length > 0 && (
          <>
            <button className="btn btn-sm" onClick={handleClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleStart}>
              <Icon name="phone" size={12} /> Start calling {queue.length} patient{queue.length !== 1 ? 's' : ''}
            </button>
          </>
        )}
        {sessionState === 'ready' && queue.length === 0 && (
          <button className="btn btn-sm" onClick={handleClose}>Close</button>
        )}
        {isSessionActive && (
          <>
            <button className="btn btn-sm" onClick={() => setMinimized(true)}>
              Minimize
            </button>
            <button className="btn btn-sm" style={{ color: 'var(--relay-urgent)', borderColor: 'var(--relay-urgent)' }} onClick={handleStop}>
              Stop after this call
            </button>
          </>
        )}
        {(sessionState === 'done' || sessionState === 'stopped') && (
          <button className="btn btn-sm btn-primary" onClick={handleClose}>Done</button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CurrentCallCard({ referral, phase, sessionState }: {
  referral: Referral;
  phase: CallProgress['phase'];
  sessionState: SessionState;
}) {
  const phaseLabel: Record<CallProgress['phase'], string> = {
    initiating: 'Connecting to ElevenLabs…',
    calling:    'Dialing patient…',
    polling:    'Call in progress…',
    saving:     'Saving call result…',
    done:       sessionState === 'countdown' ? 'Call complete' : 'Done',
    error:      'Call failed',
  };

  return (
    <div style={{
      border: '1.5px solid var(--relay-accent)',
      borderRadius: 10, padding: '12px 14px',
      background: 'var(--relay-accent-50)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'var(--relay-accent-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'var(--relay-accent-700)',
        }}>
          {referral.patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{referral.patient.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>
            {referral.reason} · {referral.patient.phone}
          </div>
        </div>
        <StatePill state={referral.state} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: phase === 'error' ? 'var(--relay-urgent)' : 'var(--relay-accent)',
        }} />
        <span style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{phaseLabel[phase]}</span>
      </div>
    </div>
  );
}

function QueueList({ queue, currentIdx, completed, onNavigate }: {
  queue: Referral[];
  currentIdx: number;
  completed: CallRecord[];
  onNavigate: (id: string) => void;
}) {
  const completedIds = new Set(completed.map(c => c.referralId));
  const upcoming = queue.slice(currentIdx + 1).filter(r => !completedIds.has(r.id));
  if (upcoming.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--relay-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        Up next · {upcoming.length} remaining
      </div>
      <div style={{ border: '1px solid var(--relay-hairline)', borderRadius: 8, overflow: 'hidden' }}>
        {upcoming.slice(0, 5).map((r, i) => (
          <div key={r.id}
            onClick={() => onNavigate(r.id)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '11px 12px',
              borderBottom: i < Math.min(upcoming.length, 5) - 1 ? '1px solid var(--relay-hairline)' : 'none',
              background: 'var(--relay-surface)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--relay-tint)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--relay-surface)')}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'var(--relay-tint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, color: 'var(--relay-ink-3)',
            }}>
              {r.patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.patient.name}</span>
                {r.priority === 'urgent' && (
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--relay-urgent)', background: 'var(--relay-urgent-50)', padding: '1px 5px', borderRadius: 99 }}>
                    URGENT
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.reason}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>
                  <span style={{ color: 'var(--relay-ink-4, var(--relay-ink-3))' }}>Referred</span> {r.referralTime}
                </span>
                <span style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>
                  <span style={{ color: 'var(--relay-ink-4, var(--relay-ink-3))' }}>By</span> {r.referringProvider}
                </span>
                <span style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>{r.patient.language}</span>
              </div>
            </div>
            <StatePill state={r.state} />
          </div>
        ))}
        {upcoming.length > 5 && (
          <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--relay-ink-3)', background: 'var(--relay-tint)', textAlign: 'center' }}>
            +{upcoming.length - 5} more in queue
          </div>
        )}
      </div>
    </div>
  );
}

function SessionSummary({ completed, stopped }: { completed: CallRecord[]; stopped: boolean }) {
  const outcomes = completed.reduce<Record<string, number>>((acc, c) => {
    acc[c.outcome] = (acc[c.outcome] ?? 0) + 1;
    return acc;
  }, {});
  const booked = completed.filter(c => c.outcome === 'Appointment Accepted').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: booked > 0 ? 'var(--relay-accent-50)' : 'var(--relay-tint)',
        border: `1px solid ${booked > 0 ? 'var(--relay-accent)' : 'var(--relay-hairline)'}`,
        borderRadius: 10, padding: '14px 16px',
      }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          {stopped ? 'Session stopped' : 'Session complete'}
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Total called</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{completed.length}</div>
          </div>
          {booked > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--relay-ink-3)' }}>Appointments accepted</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--relay-accent)' }}>{booked}</div>
            </div>
          )}
        </div>
      </div>
      {Object.keys(outcomes).length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--relay-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Outcome breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(outcomes).map(([outcome, count]) => (
              <div key={outcome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--relay-tint)', borderRadius: 7 }}>
                <span style={{ fontSize: 13, color: outcomeColor(outcome as CallOutcome) }}>{outcome}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
