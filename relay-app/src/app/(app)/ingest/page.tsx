'use client';

// Ingest referrals — the only ways referrals get into Relay by hand: a
// spreadsheet upload (parse → review → import) or one referral entered manually.
// SMS consent is recorded explicitly per patient and never assumed: without it
// the texting assistant will not contact the patient.

import { useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { read as xlsxRead, utils as xlsxUtils, writeFileXLSX } from 'xlsx';
import { PageHead } from '@/components/layout/PageHead';
import { Icon } from '@/components/shared/Icon';
import { ingestReferrals } from '@/lib/data';
import type { IngestReferralInput } from '@/lib/data';

// ── Column header normalisation ───────────────────────────────────────────────

const COL_MAP: Record<string, keyof ParsedRow> = {
  // name
  'patient name': 'patientName', 'patient': 'patientName', 'name': 'patientName',
  'full name': 'patientName', 'last, first': 'patientName',
  // dob
  'date of birth': 'dateOfBirth', 'dob': 'dateOfBirth', 'birth date': 'dateOfBirth', 'birthdate': 'dateOfBirth',
  // phone
  'phone': 'phone', 'phone number': 'phone', 'cell': 'phone', 'mobile': 'phone',
  'contact number': 'phone', 'telephone': 'phone',
  // sex
  'sex': 'sex', 'gender': 'sex',
  // language
  'language': 'language', 'lang': 'language', 'preferred language': 'language',
  // insurance
  'insurance': 'insurance', 'ins': 'insurance', 'insurance plan': 'insurance', 'payer': 'insurance',
  'insurance carrier': 'insurance',
  // reason
  'reason': 'reason', 'referral reason': 'reason', 'reason for referral': 'reason',
  'diagnosis': 'reason', 'dx': 'reason', 'chief complaint': 'reason',
  // referring provider
  'referring provider': 'referringProvider', 'referring physician': 'referringProvider',
  'provider': 'referringProvider', 'referred by': 'referringProvider',
  'by': 'referringProvider', 'physician': 'referringProvider', 'doctor': 'referringProvider',
  // priority
  'priority': 'priority', 'urgency': 'priority',
  // location
  'location': 'location', 'site': 'location', 'office': 'location',
  // SMS consent
  'sms consent': 'consentRaw', 'text consent': 'consentRaw', 'consent to text': 'consentRaw',
  'ok to text': 'consentRaw', 'consent': 'consentRaw',
  'consent source': 'smsConsentSource', 'sms consent source': 'smsConsentSource',
};

interface ParsedRow extends IngestReferralInput {
  _rawIndex: number;
  flags: string[];
  /** Raw "SMS Consent" cell; only a clear yes becomes smsConsent = true. */
  consentRaw?: string;
}

const CONSENT_YES = new Set(['yes', 'y', 'true', '1', 'x', 'consented', 'si', 'sí']);

/** SMS consent is never assumed: blank, "no" or anything unclear means not recorded. */
function parseConsent(raw: string | undefined): boolean {
  return !!raw && CONSENT_YES.has(raw.trim().toLowerCase());
}

function normaliseHeader(h: string): keyof ParsedRow | null {
  const key = h.trim().toLowerCase().replace(/[^a-z ]/g, '');
  return COL_MAP[key] ?? null;
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

function formatDisplayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const d = digits.length === 11 ? digits.slice(1) : digits;
  if (d.length === 10) return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function parseRows(sheetRows: Record<string, unknown>[], existingPhones: Set<string>): ParsedRow[] {
  return sheetRows.map((row, idx) => {
    const parsed: Partial<ParsedRow> & { flags: string[]; _rawIndex: number } = {
      _rawIndex: idx,
      flags: [],
      patientName: '',
      phone: '',
    };

    for (const [header, value] of Object.entries(row)) {
      const field = normaliseHeader(header);
      if (field && value != null) {
        const strVal = value instanceof Date
          ? `${String(value.getMonth() + 1).padStart(2, '0')}/${String(value.getDate()).padStart(2, '0')}/${value.getFullYear()}`
          : String(value).trim();
        if (strVal !== '') (parsed as Record<string, unknown>)[field] = strVal;
      }
    }

    if (!parsed.patientName || parsed.patientName.trim() === '') {
      parsed.flags.push('Missing patient name');
    }

    if (!parsed.phone || parsed.phone.trim() === '') {
      parsed.flags.push('Missing phone');
    } else {
      const normed = normalisePhone(parsed.phone);
      parsed.phone = normed;
      if (!isValidPhone(normed)) {
        parsed.flags.push('Invalid phone number');
      } else if (existingPhones.has(normed)) {
        parsed.flags.push('Possible duplicate');
      }
    }

    if (!parsed.reason || parsed.reason.trim() === '') {
      parsed.flags.push('Missing referral reason');
    }

    if (parsed.sex) {
      const s = parsed.sex.toUpperCase();
      if (s === 'M' || s === 'MALE') parsed.sex = 'M';
      else if (s === 'F' || s === 'FEMALE') parsed.sex = 'F';
      else parsed.sex = '';
    }

    if (parsed.priority) {
      const p = parsed.priority.toLowerCase();
      parsed.priority = p === 'urgent' ? 'urgent' : 'normal';
    }

    parsed.smsConsent = parseConsent(parsed.consentRaw);
    if (!parsed.smsConsent) parsed.smsConsentSource = undefined;

    return parsed as ParsedRow;
  });
}

// ── Template download ─────────────────────────────────────────────────────────

function downloadTemplate() {
  const headers = [
    'Patient Name', 'Date of Birth', 'Phone', 'Sex', 'Language',
    'Insurance', 'Reason', 'Referring Provider', 'Priority', 'Location',
    'SMS Consent', 'Consent Source',
  ];
  const example = [
    'Jane Smith', '03/15/1962', '(415) 555-0101', 'F', 'English',
    'Aetna', 'AFib follow-up', 'Dr. Chen', 'normal', 'Mission Bay',
    'yes', 'intake form',
  ];
  const ws = xlsxUtils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(wb, ws, 'Referrals');
  writeFileXLSX(wb, 'relay-referral-template.xlsx');
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IngestPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [consentedCount, setConsentedCount] = useState(0);
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');

  const flagCount = rows?.filter(r => r.flags.length > 0).length ?? 0;
  const okRows = rows?.filter(r => r.flags.length === 0) ?? [];

  async function processFile(file: File) {
    setParseError(null);
    setRows(null);
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = xlsxRead(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, unknown>[] = xlsxUtils.sheet_to_json(ws, { defval: '' });

      if (raw.length === 0) {
        setParseError('The spreadsheet appears to be empty. Check that the first sheet has data and a header row.');
        return;
      }

      // Detect if any recognised column was found
      const headers = Object.keys(raw[0]);
      const recognised = headers.filter(h => normaliseHeader(h) !== null);
      if (recognised.length === 0) {
        setParseError(
          `No recognised columns found. Expected headers like "Patient Name", "Phone", "Reason". ` +
          `Found: ${headers.slice(0, 5).join(', ')}. Download the template to see the expected format.`
        );
        return;
      }

      const seenPhones = new Set<string>();
      const parsed = parseRows(raw, seenPhones);
      setRows(parsed);
    } catch {
      setParseError('Could not parse this file. Make sure it is a valid .xlsx or .xls file.');
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  async function handleImport() {
    if (!okRows.length) return;
    setImporting(true);
    const inputs: IngestReferralInput[] = okRows.map(r => ({
      patientName: r.patientName,
      dateOfBirth: r.dateOfBirth,
      phone: r.phone,
      sex: r.sex,
      language: r.language,
      insurance: r.insurance,
      reason: r.reason,
      referringProvider: r.referringProvider,
      priority: r.priority,
      location: r.location,
      smsConsent: r.smsConsent === true,
      smsConsentSource: r.smsConsent ? r.smsConsentSource : undefined,
    }));
    const result = await ingestReferrals(inputs, 'upload');
    setImportedCount(result.importedCount);
    setConsentedCount(result.consentedCount);
    setSkippedCount(flagCount);
    setImporting(false);
    setImported(true);
  }

  function handleReset() {
    setImported(false);
    setRows(null);
    setFileName(null);
    setParseError(null);
  }

  if (imported) {
    return (
      <>
        <PageHead title="Ingest referrals" sub="Add referrals to Relay by spreadsheet or one at a time." />
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--st-booked-bg)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--relay-accent)' }}>
            <Icon name="check" size={24} />
          </div>
          <div className="fw-6" style={{ fontSize: 16 }}>
            {importedCount} referral{importedCount !== 1 ? 's' : ''} imported successfully
          </div>
          <div style={{ fontSize: 13, color: 'var(--relay-ink-3)', marginTop: 6 }}>
            {skippedCount > 0 && `${skippedCount} flagged row${skippedCount !== 1 ? 's' : ''} skipped · `}
            All are Queued. {consentedCount} with SMS consent will get outreach texts in the next outreach window
            {importedCount - consentedCount > 0 && `; ${importedCount - consentedCount} without consent wait until staff record it on the referral`}.
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn" onClick={handleReset}>Upload another file</button>
            <Link className="btn btn-primary" href="/referrals">View referrals</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Ingest referrals"
        sub="Add referrals to Relay by spreadsheet or one at a time. Schedule imports from eCW live under eCW import."
      />

      <div style={{ display: 'inline-flex', border: '1px solid var(--relay-hairline)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        {([['upload', 'Upload spreadsheet', 'upload'], ['manual', 'Enter one referral', 'edit']] as const).map(([key, label, icon], i) => {
          const on = mode === key;
          return (
            <button key={key} onClick={() => setMode(key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 'none',
              borderLeft: i > 0 ? '1px solid var(--relay-hairline)' : 'none',
              background: on ? 'var(--relay-accent)' : 'var(--relay-surface)', color: on ? '#fff' : 'var(--relay-ink-2)',
              fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Icon name={icon} size={12} /> {label}
            </button>
          );
        })}
      </div>

      {mode === 'manual' ? (
        <ManualEntry onCreated={(n, consented) => { setImportedCount(n); setConsentedCount(consented); setSkippedCount(0); setImported(true); }} />
      ) : (<>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="card"
        style={{
          borderStyle: 'dashed',
          borderColor: dragging ? 'var(--relay-accent)' : 'var(--relay-hairline-strong)',
          background: dragging ? 'var(--relay-tint)' : 'var(--relay-surface)',
          padding: 28, textAlign: 'center', cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <Icon name="upload" size={24} />
        <div className="fw-6" style={{ marginTop: 6, fontSize: 15 }}>
          {fileName ? `Loaded: ${fileName}` : 'Drop a spreadsheet here'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--relay-ink-3)', marginTop: 2 }}>
          Excel (.xlsx, .xls) · up to 500 rows · we&apos;ll parse, validate, and let you review before commit
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
            <Icon name="upload" size={12} /> Choose file
          </button>
          <button className="btn btn-sm" onClick={e => { e.stopPropagation(); downloadTemplate(); }}>
            <Icon name="download" size={12} /> Download template
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
      </div>

      {/* Column guide */}
      {!rows && !parseError && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--relay-tint)', borderRadius: 'var(--relay-radius)', border: '1px solid var(--relay-hairline)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--relay-ink-2)', marginBottom: 6 }}>Recognised column headers</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 12 }}>
            {['Patient Name', 'Date of Birth', 'Phone', 'Sex', 'Language', 'Insurance', 'Reason', 'Referring Provider', 'Priority', 'Location', 'SMS Consent', 'Consent Source'].map(h => (
              <span key={h} style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 4, padding: '1px 7px', color: 'var(--relay-ink-2)' }}>{h}</span>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--relay-ink-4)', marginTop: 6 }}>
            Flexible matching — variations like &ldquo;DOB&rdquo;, &ldquo;Referring Physician&rdquo;, &ldquo;Payer&rdquo;, &ldquo;Cell&rdquo; are also recognised.
            SMS Consent must say &ldquo;yes&rdquo; to record consent; blank or anything else means not recorded (no texts until staff record it).
          </div>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--relay-urgent-50)', border: '1px solid var(--relay-urgent-100)', borderRadius: 'var(--relay-radius)', color: '#b91c1c', fontSize: 13 }}>
          <Icon name="alert" size={14} /> {parseError}
        </div>
      )}

      {/* Preview table */}
      {rows && (
        <div style={{ marginTop: 22 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                Preview · {rows.length} row{rows.length !== 1 ? 's' : ''} parsed from {fileName}
              </h3>
              <p className="card-sub">
                {okRows.length} ready · {flagCount} flagged ·{' '}
                {flagCount > 0 && 'flagged rows will be skipped · '}
                review before commit
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={handleReset}>
                Clear
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleImport}
                disabled={okRows.length === 0 || importing}
              >
                <Icon name="check" size={12} />
                {importing ? 'Importing…' : `Import ${okRows.length} referral${okRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          {flagCount > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: 'var(--relay-urgent-50)', border: '1px solid var(--relay-urgent-100)', borderRadius: 'var(--relay-radius)', fontSize: 12.5, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="alert" size={13} />
              {flagCount} row{flagCount !== 1 ? 's' : ''} flagged — fix them in your spreadsheet and re-upload to include them. All other rows will import cleanly.
            </div>
          )}

          <div style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 'var(--relay-radius)', overflow: 'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  <th>Patient</th>
                  <th>DOB</th>
                  <th>Phone</th>
                  <th>Reason</th>
                  <th>Referring</th>
                  <th>Language</th>
                  <th>Insurance</th>
                  <th>Priority</th>
                  <th>SMS consent</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ background: r.flags.length ? 'var(--relay-urgent-50)' : undefined }}>
                    <td>
                      {r.flags.length > 0
                        ? <span style={{ color: 'var(--relay-urgent)' }}><Icon name="alert" size={13} /></span>
                        : <span style={{ color: 'var(--relay-accent)' }}><Icon name="check" size={13} /></span>}
                    </td>
                    <td style={{ fontWeight: 500 }}>{r.patientName || <span style={{ color: 'var(--relay-ink-4)' }}>—</span>}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{r.dateOfBirth || '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: r.flags.includes('Invalid phone number') ? '#b91c1c' : undefined }}>
                      {r.phone ? formatDisplayPhone(r.phone) : <span style={{ color: 'var(--relay-ink-4)' }}>—</span>}
                    </td>
                    <td style={{ color: r.flags.includes('Missing referral reason') ? '#b91c1c' : 'var(--relay-ink-2)' }}>
                      {r.reason || <em style={{ color: 'var(--relay-ink-4)' }}>—</em>}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--relay-ink-2)' }}>{r.referringProvider || '—'}</td>
                    <td style={{ color: 'var(--relay-ink-2)' }}>{r.language || '—'}</td>
                    <td style={{ color: 'var(--relay-ink-2)' }}>{r.insurance || '—'}</td>
                    <td>
                      {r.priority === 'urgent'
                        ? <span style={{ fontSize: 11.5, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)', padding: '2px 7px', borderRadius: 99, fontWeight: 500 }}>Urgent</span>
                        : <span style={{ fontSize: 11.5, color: 'var(--relay-ink-3)' }}>Normal</span>}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {r.smsConsent
                        ? <span title={r.smsConsentSource || 'referral intake'} style={{ color: 'var(--relay-accent-700)' }}><Icon name="check" size={11} /> Yes{r.smsConsentSource ? ` · ${r.smsConsentSource}` : ''}</span>
                        : <span style={{ color: 'var(--relay-ink-3)' }}>Not recorded</span>}
                    </td>
                    <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {r.flags.map(f => (
                        <span key={f} style={{ fontSize: 11, background: 'var(--relay-urgent-100)', color: 'var(--relay-urgent-700)', padding: '2px 6px', borderRadius: 99, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {f}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--relay-ink-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="info" size={12} />
            Importing creates referrals in Queued state. Only patients with recorded SMS consent are texted; quiet hours and the outreach cadence in Settings apply.
          </div>
        </div>
      )}
      </>)}
    </>
  );
}

// ── Manual entry (one referral) ───────────────────────────────────────────────

const EMPTY_MANUAL = {
  patientName: '', dateOfBirth: '', phone: '', sex: '' as '' | 'M' | 'F', language: 'English', insurance: '',
  reason: '', referringProvider: '', priority: 'normal' as 'normal' | 'urgent', smsConsent: false, smsConsentSource: '',
};

function ManualEntry({ onCreated }: { onCreated: (count: number, consented: number) => void }) {
  const [f, setF] = useState(EMPTY_MANUAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof EMPTY_MANUAL>(k: K, v: (typeof EMPTY_MANUAL)[K]) => setF(prev => ({ ...prev, [k]: v }));

  const problems: string[] = [];
  if (!f.patientName.trim()) problems.push('Patient name is required');
  if (!isValidPhone(f.phone)) problems.push('Enter a 10-digit US phone number');
  if (f.dateOfBirth && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(f.dateOfBirth.trim())) problems.push('Date of birth must be MM/DD/YYYY');
  if (!f.reason.trim()) problems.push('Referral reason is required');
  if (f.smsConsent && !f.smsConsentSource.trim()) problems.push('Say where SMS consent came from');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length) return;
    setSaving(true);
    setError(null);
    const result = await ingestReferrals([{
      patientName: f.patientName.trim(), dateOfBirth: f.dateOfBirth.trim() || undefined, phone: normalisePhone(f.phone),
      sex: f.sex, language: f.language.trim() || 'English', insurance: f.insurance.trim(), reason: f.reason.trim(),
      referringProvider: f.referringProvider.trim(), priority: f.priority,
      smsConsent: f.smsConsent, smsConsentSource: f.smsConsent ? f.smsConsentSource.trim() : undefined,
    }], 'manual');
    setSaving(false);
    if (!result.success || result.importedCount === 0) { setError('Could not save the referral. Try again.'); return; }
    setF(EMPTY_MANUAL);
    onCreated(result.importedCount, result.consentedCount);
  }

  const input = (k: 'patientName' | 'dateOfBirth' | 'phone' | 'language' | 'insurance' | 'reason' | 'referringProvider', label: string, placeholder = '') => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>{label}</span>
      <input value={f[k]} placeholder={placeholder} onChange={e => set(k, e.target.value)}
        style={{ fontSize: 13, padding: '6px 9px', border: '1px solid var(--relay-hairline)', borderRadius: 6, background: 'var(--relay-surface)', color: 'var(--relay-ink)', fontFamily: 'inherit' }} />
    </label>
  );

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-head">
        <div>
          <h3>New referral</h3>
          <p className="card-sub">Creates one referral in Queued state.</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {input('patientName', 'Patient name *', 'Jane Smith')}
        {input('dateOfBirth', 'Date of birth', 'MM/DD/YYYY')}
        {input('phone', 'Mobile phone *', '(415) 555-0101')}
        {input('reason', 'Referral reason *', 'AFib follow-up')}
        {input('referringProvider', 'Referring provider', 'Dr. Chen')}
        {input('insurance', 'Insurance')}
        {input('language', 'Preferred language')}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Sex</span>
          <select className="select-sm" value={f.sex} onChange={e => set('sex', e.target.value as '' | 'M' | 'F')}>
            <option value="">—</option><option value="F">F</option><option value="M">M</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Priority</span>
          <select className="select-sm" value={f.priority} onChange={e => set('priority', e.target.value as 'normal' | 'urgent')}>
            <option value="normal">Normal</option><option value="urgent">Urgent</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 16, padding: '12px 14px', border: '1px solid var(--relay-hairline)', borderRadius: 'var(--relay-radius-sm)', background: 'var(--relay-tint)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
          <input type="checkbox" checked={f.smsConsent} onChange={e => set('smsConsent', e.target.checked)} />
          The patient agreed to receive scheduling texts from the clinic
        </label>
        <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', marginTop: 4, marginLeft: 24 }}>
          Leave unchecked if you have not asked. Relay never texts a patient without recorded consent; you can record it later on the referral.
        </div>
        {f.smsConsent && (
          <div style={{ marginTop: 10, marginLeft: 24, maxWidth: 360 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--relay-ink-3)' }}>Where consent came from *</span>
              <input value={f.smsConsentSource} placeholder="e.g. intake form, verbal at front desk" onChange={e => set('smsConsentSource', e.target.value)}
                style={{ fontSize: 13, padding: '6px 9px', border: '1px solid var(--relay-hairline)', borderRadius: 6, background: 'var(--relay-surface)', color: 'var(--relay-ink)', fontFamily: 'inherit' }} />
            </label>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {problems.length > 0 && (f.patientName || f.phone || f.reason) && (
          <span style={{ fontSize: 12, color: 'var(--relay-urgent-700)' }}>{problems[0]}</span>
        )}
        {error && <span role="alert" style={{ fontSize: 12, color: 'var(--relay-urgent-700)' }}>{error}</span>}
        <button type="button" className="btn btn-sm" onClick={() => setF(EMPTY_MANUAL)} disabled={saving}>Clear</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={saving || problems.length > 0}>
          <Icon name="check" size={12} /> {saving ? 'Saving…' : 'Add referral'}
        </button>
      </div>
    </form>
  );
}
