'use client';

// Settings → "Epic sandbox (prototype)" (docs/EPIC_PROTOTYPE_PLAN.md). Synthetic Epic sandbox data only.
// - "Book into Epic (sandbox)" toggle: when on, the MA's Confirm books in the Epic sandbox (Phase 4).
// - Simulated referral feed: Epic sandbox patient FHIR IDs that "Sync from Epic" imports as referrals.
// Admin-only writes; everyone else sees it read-only.

import { useEffect, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { Row, inputStyle } from '@/components/screens/settings/TextingSettings';
import { useSession } from '@/contexts/SessionContext';
import { getEpicSettings, saveEpicSettings, syncFromEpic } from '@/lib/data';
import type { EpicFeedPatient, EpicSettingsView, EpicSyncResult } from '@/lib/types';

const DEFAULT_VISIT_TYPE = '95014';

const SANDBOX_TEST_PATIENTS = [
  { name: 'Camila Lopez', fhirId: 'erXuFYUfucBZaryVksYEcMg3' },
  { name: 'Derrick Lin', fhirId: 'eq081-VQEgP8drUUqCWzHfw3' },
];

const onStyle: React.CSSProperties = { background: 'var(--relay-accent-50)', borderColor: 'var(--relay-accent)', color: 'var(--relay-accent-700)' };
const subText: React.CSSProperties = { fontSize: 12, color: 'var(--relay-ink-3)' };
const thStyle: React.CSSProperties = { textAlign: 'left', fontWeight: 500, fontSize: 11.5, color: 'var(--relay-ink-3)', padding: '0 8px 6px 0' };

function fmtWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SyncSummary({ result }: { result: EpicSyncResult }) {
  const failed = result.errors.length > 0;
  return (
    <div
      role="status"
      style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12.5,
        background: failed ? 'var(--relay-urgent-50)' : 'var(--relay-accent-50)',
        border: `1px solid ${failed ? 'var(--relay-urgent-200)' : 'var(--relay-hairline)'}`,
      }}
    >
      <div className="fw-6">
        {result.imported} imported · {result.updated} updated · {result.alreadyOpen} already in Relay · {result.errors.length} {result.errors.length === 1 ? 'error' : 'errors'}
      </div>
      {result.items.some(i => i.referralId) && (
        <div style={{ ...subText, marginTop: 4 }}>
          {result.items.filter(i => i.referralId).map(i => (
            <span key={i.fhirId} style={{ marginRight: 12 }}>
              {i.patient} → <span className="mono">{i.referralId}</span>{i.outcome === 'already_open' ? ' (already open)' : ''}
            </span>
          ))}
        </div>
      )}
      {result.errors.map(e => (
        <div key={e.fhirId} style={{ marginTop: 4, color: 'var(--relay-urgent-700)' }}>
          <span className="mono">{e.fhirId}</span>: {e.error}
        </div>
      ))}
    </div>
  );
}

export function EpicSettings() {
  const { isAdmin } = useSession();
  const [view, setView] = useState<EpicSettingsView | null>(null);
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [patients, setPatients] = useState<EpicFeedPatient[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncResult, setSyncResult] = useState<EpicSyncResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** `keepDraft`: the toggle saved on its own, so unsaved edits to the patient list stay. */
  function apply(v: EpicSettingsView, keepDraft = false) {
    setView(v);
    setBookingEnabled(v.settings.bookingEnabled);
    if (!keepDraft) {
      setPatients(v.settings.patients);
      setDirty(false);
    }
  }

  useEffect(() => {
    getEpicSettings().then(apply).catch(err => setLoadError(err instanceof Error ? err.message : 'Could not load'));
  }, []);

  if (!view) {
    return (
      <div className="card">
        <h3>Epic sandbox (prototype)</h3>
        <div style={{ fontSize: 12.5, color: loadError ? 'var(--relay-urgent-700)' : 'var(--relay-ink-3)' }}>{loadError ?? 'Loading…'}</div>
      </div>
    );
  }

  const busy = saving || syncing;
  const disabled = !isAdmin || busy;
  const connected = view.connector === 'epic-sandbox';
  const lastResult = syncResult ?? view.settings.lastSyncResult;

  async function save(next: { bookingEnabled: boolean; patients: EpicFeedPatient[] }, note: string, keepDraft = false) {
    setSaving(true);
    setMsg(null);
    try {
      apply(await saveEpicSettings(next), keepDraft);
      setMsg({ ok: true, text: note });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      const result = await syncFromEpic();
      setSyncResult(result);
      apply(await getEpicSettings());
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  }

  const edit = (i: number, patch: Partial<EpicFeedPatient>) => {
    setPatients(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    setDirty(true);
  };
  const addRow = (fhirId = '') => {
    setPatients(ps => [...ps, { fhirId, visitType: DEFAULT_VISIT_TYPE, specialty: null }]);
    setDirty(true);
  };
  const removeRow = (i: number) => {
    setPatients(ps => ps.filter((_, j) => j !== i));
    setDirty(true);
  };
  const missingTestPatients = SANDBOX_TEST_PATIENTS.filter(t => !patients.some(p => p.fhirId === t.fhirId));

  return (
    <div className="card">
      <div className="card-head">
        <h3>Epic sandbox (prototype)</h3>
        <span style={{ ...subText, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="link" size={12} />
          {connected ? 'Connected to Epic sandbox' : 'Using the built-in fake EHR (no Epic credentials set)'}
        </span>
      </div>

      <Row
        label="Book into Epic (sandbox)"
        sub="When on, the MA's Confirm books the slot in the Epic sandbox and adds it to Relay's Calendar. A person approves every booking. Sandbox test patients only."
      >
        <button
          className="btn btn-sm" disabled={disabled}
          style={bookingEnabled ? onStyle : undefined}
          aria-pressed={bookingEnabled}
          onClick={() => save({ bookingEnabled: !bookingEnabled, patients: view.settings.patients },
            bookingEnabled ? 'Booking into Epic is off.' : 'Booking into Epic (sandbox) is on.', true)}
        >
          {bookingEnabled ? 'On' : 'Off'}
        </button>
      </Row>

      <div style={{ padding: '14px 0', borderBottom: '1px solid var(--relay-hairline)' }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>Simulated referral feed</div>
        <div style={{ ...subText, marginTop: 2 }}>
          Epic has no referral list to read, so Relay imports these Epic sandbox patients as referrals when you press Sync from Epic.
          Sandbox test IDs: {SANDBOX_TEST_PATIENTS.map((t, i) => (
            <span key={t.fhirId}>{i > 0 && ', '}{t.name} <span className="mono">{t.fhirId}</span></span>
          ))}.
        </div>

        {patients.length > 0 ? (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Epic patient FHIR ID</th>
                <th style={thStyle}>Visit type code</th>
                <th style={thStyle}>Specialty</th>
                <th style={{ ...thStyle, width: 32 }} aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {patients.map((p, i) => (
                <tr key={i}>
                  <td style={{ padding: '0 8px 6px 0' }}>
                    <input
                      aria-label={`Epic patient FHIR ID, row ${i + 1}`} value={p.fhirId} disabled={disabled}
                      placeholder="e.g. erXuFYUfucBZaryVksYEcMg3"
                      className="mono" style={{ ...inputStyle, width: '100%' }}
                      onChange={e => edit(i, { fhirId: e.target.value })}
                    />
                  </td>
                  <td style={{ padding: '0 8px 6px 0', width: 120 }}>
                    <input
                      aria-label={`Visit type code, row ${i + 1}`} value={p.visitType} disabled={disabled}
                      style={{ ...inputStyle, width: '100%' }} onChange={e => edit(i, { visitType: e.target.value })}
                    />
                  </td>
                  <td style={{ padding: '0 8px 6px 0', width: 200 }}>
                    <input
                      aria-label={`Specialty, row ${i + 1}`} value={p.specialty ?? ''} disabled={disabled}
                      placeholder="e.g. Family Medicine"
                      style={{ ...inputStyle, width: '100%' }} onChange={e => edit(i, { specialty: e.target.value || null })}
                    />
                  </td>
                  <td style={{ padding: '0 0 6px 0' }}>
                    {isAdmin && (
                      <button className="btn btn-sm btn-ghost" disabled={busy} aria-label={`Remove row ${i + 1}`} onClick={() => removeRow(i)}>
                        <Icon name="trash" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ ...subText, marginTop: 12 }}>No Epic patients listed yet.</div>
        )}

        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" disabled={busy} onClick={() => addRow()}>
              <Icon name="plus" size={12} /> Add patient
            </button>
            {missingTestPatients.map(t => (
              <button key={t.fhirId} className="btn btn-sm btn-ghost" disabled={busy} onClick={() => addRow(t.fhirId)}>
                <Icon name="plus" size={12} /> {t.name} (sandbox)
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ paddingTop: 14 }}>
        <div className="between" style={{ gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>Sync from Epic <span style={{ ...subText, fontWeight: 400 }}>(prototype)</span></div>
            <div style={{ ...subText, marginTop: 2 }}>
              Imports the saved patient list as new referrals. Patients who already have an open referral are not added twice.
              Manual only; no texts are sent by syncing.
              {view.settings.lastSyncAt ? ` Last sync ${fmtWhen(view.settings.lastSyncAt)}.` : ' Never synced.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {isAdmin && (
              <button
                className="btn btn-sm" disabled={busy || !dirty}
                onClick={() => save({ bookingEnabled: view.settings.bookingEnabled, patients }, 'Patient list saved.')}
              >
                {saving ? 'Saving…' : 'Save patient list'}
              </button>
            )}
            <button
              className="btn btn-sm btn-primary" disabled={disabled || dirty}
              style={isAdmin ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
              title={dirty ? 'Save the patient list first' : undefined}
              onClick={sync}
            >
              <Icon name="refresh" size={12} /> {syncing ? 'Syncing…' : 'Sync from Epic'}
            </button>
          </div>
        </div>

        {lastResult && <SyncSummary result={lastResult} />}

        <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          {!isAdmin && (
            <span style={{ ...subText, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="shield" size={12} /> Only administrators can change Epic settings or sync
            </span>
          )}
          {dirty && isAdmin && <span style={{ fontSize: 12, color: 'var(--relay-urgent-700)' }}>Unsaved changes</span>}
          {msg && (
            <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12.5, color: msg.ok ? 'var(--relay-accent)' : 'var(--relay-urgent-700)' }}>
              {msg.text}
            </span>
          )}
          {view.settings.updatedBy && (
            <span style={{ fontSize: 11.5, color: 'var(--relay-ink-4)' }}>
              Last saved {fmtWhen(view.settings.updatedAt)} by {view.settings.updatedBy}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
