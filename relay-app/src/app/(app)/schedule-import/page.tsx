'use client';

// eCW schedule import. Staff upload the eCW appointment report (CSV/Excel) once or
// twice a day: 1 upload → 2 match columns → 3 dry-run preview → Apply.
// Connector mode: Relay reads the eCW schedule and updates its own mirror; it never
// writes to eCW. All data goes through src/lib/data.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { ImportHistory } from '@/components/screens/schedule-import/ImportHistory';
import { MappingCard } from '@/components/screens/schedule-import/MappingCard';
import { changeCount, CountsLine, PreviewCard } from '@/components/screens/schedule-import/PreviewCard';
import {
  applyScheduleImport, discardScheduleImport, getScheduleImports, previewScheduleImport, uploadScheduleFile,
} from '@/lib/data';
import type { EcwImportOptions, EcwMapping } from '@/lib/ecwImport';
import type { EcwApplyResult, EcwImportDraft, EcwImportOverview } from '@/lib/types';

const MAX_MB = 5;

export default function ScheduleImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [overview, setOverview] = useState<EcwImportOverview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EcwImportDraft | null>(null);
  const [mapping, setMapping] = useState<EcwMapping>({});
  const [options, setOptions] = useState<EcwImportOptions | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saveProfile, setSaveProfile] = useState(true);
  const [profileName, setProfileName] = useState('eCW appointment report');
  const [result, setResult] = useState<EcwApplyResult | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const loadOverview = useCallback(() => { getScheduleImports().then(setOverview).catch(() => {}); }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  function adoptDraft(d: EcwImportDraft) {
    setDraft(d);
    setMapping(d.mapping);
    setOptions(d.options);
    setDirty(false);
    if (d.profileName) { setProfileName(d.profileName); setSaveProfile(false); }
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    if (!/\.(csv|xlsx)$/i.test(file.name)) { setError('Upload a .csv or .xlsx file. Older .xls files: open in Excel and save as .xlsx or CSV.'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`The file is larger than ${MAX_MB} MB. Export a shorter date range.`); return; }
    setUploading(true);
    try {
      adoptDraft(await uploadScheduleFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handlePreview() {
    if (!draft || !options) return;
    setPreviewing(true);
    setError(null);
    try {
      const d = await previewScheduleImport(draft.importId, mapping, options);
      setDraft({ ...d, profileName: draft.profileName });
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!draft || !options) return;
    setApplying(true);
    setError(null);
    const r = await applyScheduleImport(draft.importId, mapping, options, saveProfile && !draft.profileName ? profileName.trim() : undefined);
    setApplying(false);
    if (!r.success) { setError(r.errorMsg ?? 'Apply failed.'); return; }
    setResult(r);
    setDraft(null);
    setOpenId(r.openReview ? r.importId ?? null : null);
    loadOverview();
  }

  async function handleDiscard() {
    if (draft) await discardScheduleImport(draft.importId);
    setDraft(null);
    setError(null);
  }

  const status = overview?.status;
  const preview = draft?.preview ?? null;
  const changes = preview ? changeCount(preview.counts) : 0;

  return (
    <>
      <PageHead
        title="eCW schedule import"
        sub="Upload the eCW appointment report. Relay matches it to referrals and shows what would change — nothing changes until you Apply. Relay never writes to eCW."
      />

      {status && (
        <div className={`alerts-strip${status.stale ? '' : ' calm'}`} style={{ marginBottom: 16 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0,
            background: status.stale ? 'var(--relay-urgent-100)' : 'var(--relay-accent-50)',
            color: status.stale ? 'var(--relay-urgent-700)' : 'var(--relay-accent-700)',
          }}>
            <Icon name={status.stale ? 'alert' : 'check'} size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
              {status.never ? 'No eCW schedule imported yet — schedule data may be stale'
                : status.stale ? `Last import ${status.lastAppliedAt} (${status.hoursAgo} h ago) — schedule data may be stale`
                : `Schedule is current — last import ${status.lastAppliedAt} by ${status.lastAppliedBy}`}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 2 }}>
              Import at least once a day (morning, and again after lunch if you can).
              {status.openReview > 0 && ` ${status.openReview} row${status.openReview === 1 ? '' : 's'} from earlier imports still need a decision (see history below).`}
            </div>
          </div>
        </div>
      )}

      <div className="stack">
        {/* 1 · Upload */}
        {!draft && (
          <div
            className="card"
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            style={{
              borderStyle: 'dashed', textAlign: 'center', padding: 28,
              borderColor: dragging ? 'var(--relay-accent)' : 'var(--relay-hairline-strong)',
              background: dragging ? 'var(--relay-tint)' : 'var(--relay-surface)',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <Icon name="upload" size={24} />
            <div className="fw-6" style={{ marginTop: 6, fontSize: 15 }}>1 · Drop today&apos;s eCW appointment report here</div>
            <div style={{ fontSize: 13, color: 'var(--relay-ink-3)', marginTop: 2 }}>
              CSV or Excel (.xlsx) · up to {MAX_MB} MB · read on the server, not kept after the import
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={12} /> {uploading ? 'Reading file…' : 'Choose file'}
              </button>
            </div>
            <input
              ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </div>
        )}

        {error && (
          <div className="alerts-strip" role="alert" style={{ padding: '10px 14px' }}>
            <Icon name="alert" size={14} />
            <div style={{ fontSize: 13 }}>{error}</div>
          </div>
        )}

        {result && result.counts && (
          <div className="alerts-strip calm">
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--st-booked-bg)', color: 'var(--relay-accent-700)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="check" size={14} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>Import applied to Relay — {changeCount(result.counts)} change{changeCount(result.counts) === 1 ? '' : 's'}</div>
              <div style={{ marginTop: 6 }}><CountsLine counts={result.counts} /></div>
              {(result.openReview ?? 0) > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)', marginTop: 6 }}>
                  {result.openReview} row{result.openReview === 1 ? '' : 's'} need a decision — opened below in the import history.
                </div>
              )}
            </div>
            <button className="btn btn-sm" onClick={() => setResult(null)}><Icon name="x" size={11} /></button>
          </div>
        )}

        {draft && options && (
          <>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
              <span style={{ color: 'var(--relay-accent)', display: 'inline-flex' }}><Icon name="check" size={16} /></span>
              <div style={{ flex: 1 }}>
                <div className="fw-6" style={{ fontSize: 13.5 }}>1 · {draft.fileName}</div>
                <div style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>{draft.rowCount} appointment rows · {draft.headers.length} columns</div>
              </div>
              <button className="btn btn-sm" onClick={handleDiscard}><Icon name="x" size={11} /> Use a different file</button>
            </div>

            {draft.alreadyApplied && (
              <div className="alerts-strip calm" style={{ padding: '10px 14px' }}>
                <Icon name="info" size={14} />
                <div style={{ fontSize: 12.5 }}>
                  This exact file was already imported on {draft.alreadyApplied.at} by {draft.alreadyApplied.by}. Importing it again is safe — nothing changes twice.
                </div>
              </div>
            )}

            <MappingCard
              draft={draft} mapping={mapping} options={options} dirty={dirty} busy={previewing}
              onMapping={m => { setMapping(m); setDirty(true); }}
              onOptions={o => { setOptions(o); setDirty(true); }}
              onPreview={handlePreview}
            />

            {preview && !dirty && (
              <>
                <PreviewCard
                  preview={preview}
                  busyProviders={options.busyProviders}
                  onBusyProviders={p => setOptions({ ...options, busyProviders: p })}
                  providerMapped={!!mapping.provider}
                />

                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {!draft.profileName && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--relay-ink-2)' }}>
                      <input type="checkbox" checked={saveProfile} onChange={e => setSaveProfile(e.target.checked)} />
                      Save this column mapping as
                      <input className="select-sm" value={profileName} onChange={e => setProfileName(e.target.value)} disabled={!saveProfile} style={{ width: 220 }} />
                    </label>
                  )}
                  <span style={{ flex: 1 }} />
                  <button className="btn" onClick={handleDiscard} disabled={applying}>Discard</button>
                  <button className="btn btn-primary" onClick={handleApply} disabled={applying || (saveProfile && !draft.profileName && !profileName.trim())}>
                    <Icon name="check" size={13} />
                    {applying ? 'Applying…' : `Apply ${changes} change${changes === 1 ? '' : 's'} to Relay`}
                    {preview.counts.review > 0 && ` · ${preview.counts.review} to review`}
                  </button>
                </div>
              </>
            )}
            {dirty && (
              <div style={{ fontSize: 12.5, color: 'var(--relay-ink-3)' }}>
                <Icon name="info" size={12} /> Column choices changed — click <b>Update preview</b> to see what would happen.
              </div>
            )}
          </>
        )}

        <ImportHistory imports={overview?.imports ?? []} openId={openId} onOpen={setOpenId} onChanged={loadOverview} />
      </div>
    </>
  );
}
