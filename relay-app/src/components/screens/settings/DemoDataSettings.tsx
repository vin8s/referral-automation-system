'use client';

// Settings → "Demo data": the admin-only Reset demo button (prototype). Deletes every
// referral, patient, appointment, text and import so a trial can be re-run from an
// empty app. Settings, staff logins and saved column mappings are kept.

import { useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { useSession } from '@/contexts/SessionContext';
import { resetDemo } from '@/lib/data';

const CONFIRM_WORD = 'RESET';

export function DemoDataSettings() {
  const { isAdmin } = useSession();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError(null);
  }

  async function run() {
    setBusy(true);
    setError(null);
    const res = await resetDemo(typed.trim());
    setBusy(false);
    if (!res.success) {
      setError(res.errorMsg ?? 'Could not reset the demo data.');
      return;
    }
    setOpen(false);
    setTyped('');
    setDone(`Demo data cleared (prototype): ${res.deleted?.referrals ?? 0} referrals, ${res.deleted?.patients ?? 0} patients and ${res.total ?? 0} rows in all were deleted. Settings were kept.`);
    // Reload so the sidebar counts and every screen show the empty app.
    window.setTimeout(() => window.location.reload(), 1800);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Demo data</h3>
        <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Prototype</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>Reset demo</div>
          <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 2 }}>
            Deletes every referral, patient, appointment, text conversation, outreach and referral log entry, and schedule
            import, so a trial can start again from an empty app. Settings, staff logins and saved column mappings are kept.
            This cannot be undone.
          </div>
        </div>
        <button
          className="btn btn-sm btn-danger" disabled={!isAdmin || busy}
          style={isAdmin ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
          onClick={() => { setDone(null); setOpen(true); }}
        >
          <Icon name="trash" size={12} /> Reset demo
        </button>
      </div>
      {!isAdmin && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--relay-ink-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="shield" size={12} /> Only administrators can reset demo data
        </div>
      )}
      {done && (
        <div role="status" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--relay-accent-700)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="check" size={12} /> {done}
        </div>
      )}

      {open && (
        <div className="modal-shade" onClick={close}>
          <div
            className="relay-modal" role="dialog" aria-modal="true" aria-labelledby="demo-reset-title"
            style={{ width: 440 }} onClick={e => e.stopPropagation()}
          >
            <div className="relay-modal-head">
              <h3 id="demo-reset-title" style={{ margin: 0, fontSize: 15 }}>Reset demo data?</h3>
              <button className="btn btn-sm btn-ghost" onClick={close} aria-label="Close" disabled={busy}>
                <Icon name="x" size={13} />
              </button>
            </div>
            <form
              className="relay-modal-body"
              onSubmit={e => { e.preventDefault(); if (typed.trim() === CONFIRM_WORD && !busy) void run(); }}
            >
              <p style={{ fontSize: 13, color: 'var(--relay-ink-2)', margin: '0 0 12px' }}>
                This permanently deletes <strong>all referrals and patients</strong> in Relay, with their appointments,
                texts and logs. Settings are kept. Type <strong>{CONFIRM_WORD}</strong> to confirm.
              </p>
              <input
                autoFocus value={typed} onChange={e => setTyped(e.target.value)} placeholder={CONFIRM_WORD}
                aria-label={`Type ${CONFIRM_WORD} to confirm`}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '6px 9px', font: 'inherit', fontSize: 13,
                  border: '1px solid var(--relay-hairline)', borderRadius: 6, background: 'var(--relay-surface)',
                  color: 'var(--relay-ink)', outline: 'none', marginBottom: 12,
                }}
              />
              {error && (
                <div role="alert" style={{ fontSize: 12.5, color: 'var(--relay-urgent-700)', marginBottom: 12 }}>{error}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-sm" style={{ flex: 1 }} onClick={close} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-sm btn-danger" style={{ flex: 1 }} disabled={busy || typed.trim() !== CONFIRM_WORD}>
                  {busy ? 'Resetting…' : 'Reset demo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
