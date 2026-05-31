'use client';

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
};

interface ParsedRow extends IngestReferralInput {
  _rawIndex: number;
  flags: string[];
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

function parseRows(sheetRows: Record<string, string>[], existingPhones: Set<string>): ParsedRow[] {
  return sheetRows.map((row, idx) => {
    const parsed: Partial<ParsedRow> & { flags: string[]; _rawIndex: number } = {
      _rawIndex: idx,
      flags: [],
      patientName: '',
      phone: '',
    };

    for (const [header, value] of Object.entries(row)) {
      const field = normaliseHeader(header);
      if (field && value != null && String(value).trim() !== '') {
        (parsed as Record<string, unknown>)[field] = String(value).trim();
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

    return parsed as ParsedRow;
  });
}

// ── Template download ─────────────────────────────────────────────────────────

function downloadTemplate() {
  const headers = [
    'Patient Name', 'Date of Birth', 'Phone', 'Sex', 'Language',
    'Insurance', 'Reason', 'Referring Provider', 'Priority', 'Location',
  ];
  const example = [
    'Jane Smith', '03/15/1962', '(415) 555-0101', 'F', 'English',
    'Aetna', 'AFib follow-up', 'Dr. Chen', 'normal', 'Mission Bay',
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
      const raw: Record<string, string>[] = xlsxUtils.sheet_to_json(ws, { defval: '' });

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

      // We'd compare against real referrals in phase 2; for now compare uploaded phones among themselves
      const seenPhones = new Set<string>();
      const parsed = parseRows(raw, seenPhones);
      // Mark cross-row duplicates (same phone appears twice in the upload)
      const phoneCounts: Record<string, number> = {};
      for (const r of parsed) {
        if (r.phone && isValidPhone(r.phone)) phoneCounts[r.phone] = (phoneCounts[r.phone] ?? 0) + 1;
      }
      for (const r of parsed) {
        if (r.phone && phoneCounts[r.phone] > 1 && !r.flags.includes('Possible duplicate')) {
          r.flags.push('Duplicate in upload');
        }
      }

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
    }));
    const result = await ingestReferrals(inputs);
    setImportedCount(result.importedCount);
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
        <PageHead title="Ingest referrals" sub="Manually upload referrals" />
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--st-booked-bg)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--relay-accent)' }}>
            <Icon name="check" size={24} />
          </div>
          <div className="fw-6" style={{ fontSize: 16 }}>
            {importedCount} referral{importedCount !== 1 ? 's' : ''} imported successfully
          </div>
          <div style={{ fontSize: 13, color: 'var(--relay-ink-3)', marginTop: 6 }}>
            {skippedCount > 0 && `${skippedCount} flagged row${skippedCount !== 1 ? 's' : ''} skipped · `}
            AI outreach cadence queued for all imported referrals
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--relay-ink-4)', marginTop: 4 }}>(prototype — data written to local session)</div>
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
        sub="Manually upload referrals"
      />

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
            {['Patient Name', 'Date of Birth', 'Phone', 'Sex', 'Language', 'Insurance', 'Reason', 'Referring Provider', 'Priority', 'Location'].map(h => (
              <span key={h} style={{ background: 'var(--relay-surface)', border: '1px solid var(--relay-hairline)', borderRadius: 4, padding: '1px 7px', color: 'var(--relay-ink-2)' }}>{h}</span>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--relay-ink-4)', marginTop: 6 }}>
            Flexible matching — variations like "DOB", "Referring Physician", "Payer", "Cell" are also recognised.
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
            Importing will create referrals in Queued state and immediately schedule the AI outreach cadence for each.
          </div>
        </div>
      )}
    </>
  );
}
