'use client';

// Step 2 of the eCW import: which column holds what. Auto-guessed (or taken from a
// saved profile); staff adjust with dropdowns, then re-run the dry-run preview.

import { Icon } from '@/components/shared/Icon';
import { ECW_FIELDS, type EcwField, type EcwImportOptions, type EcwMapping } from '@/lib/ecwImport';
import type { EcwImportDraft } from '@/lib/types';

const NONE = '';

export function MappingCard({
  draft, mapping, options, dirty, busy, onMapping, onOptions, onPreview,
}: {
  draft: EcwImportDraft;
  mapping: EcwMapping;
  options: EcwImportOptions;
  dirty: boolean;
  busy: boolean;
  onMapping: (m: EcwMapping) => void;
  onOptions: (o: EcwImportOptions) => void;
  onPreview: () => void;
}) {
  const sampleFor = (header: string | null | undefined) => {
    if (!header) return null;
    const idx = draft.headers.indexOf(header);
    const vals = draft.sample.map(r => r[idx]).filter(Boolean);
    return vals.length ? vals.slice(0, 2).join(' · ') : '(empty in first rows)';
  };
  const setField = (field: EcwField, header: string) => onMapping({ ...mapping, [field]: header || null });

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>2 · Match the columns</h3>
          <p className="card-sub">
            {draft.profileName
              ? <>Using saved mapping <span className="tag">{draft.profileName}</span> — change anything that looks wrong.</>
              : 'Relay guessed these from the column names. Check each one against the example values.'}
          </p>
        </div>
        <button className={`btn btn-sm${dirty ? ' btn-primary' : ''}`} disabled={busy} onClick={onPreview}>
          <Icon name="refresh" size={12} /> {busy ? 'Checking…' : 'Update preview'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px 18px' }}>
        {ECW_FIELDS.map(f => (
          <label key={f.field} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--relay-ink-2)' }}>{f.label}</span>
              <span style={{ fontSize: 11, color: 'var(--relay-ink-4)' }}>{f.hint}</span>
            </span>
            <select
              className="select-sm"
              value={mapping[f.field] ?? NONE}
              onChange={e => setField(f.field, e.target.value)}
              aria-label={`Column for ${f.label}`}
            >
              <option value={NONE}>— not in this file —</option>
              {draft.headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span style={{ fontSize: 11.5, color: 'var(--relay-ink-3)', minHeight: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sampleFor(mapping[f.field]) && <>e.g. {sampleFor(mapping[f.field])}</>}
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--relay-hairline)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--relay-ink-2)' }}>Date format</span>
          <select className="select-sm" value={options.dateOrder} onChange={e => onOptions({ ...options, dateOrder: e.target.value as EcwImportOptions['dateOrder'] })}>
            <option value="MDY">MM/DD/YYYY (US)</option>
            <option value="DMY">DD/MM/YYYY</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--relay-ink-2)' }}>Patient name is written</span>
          <select className="select-sm" value={options.nameOrder} onChange={e => onOptions({ ...options, nameOrder: e.target.value as EcwImportOptions['nameOrder'] })}>
            <option value="auto">Automatic (&ldquo;Last, First&rdquo; when there is a comma)</option>
            <option value="last_first">Last First</option>
            <option value="first_last">First Last</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--relay-ink-2)' }}>Length if no duration column</span>
          <select className="select-sm" value={options.defaultDurationMin} onChange={e => onOptions({ ...options, defaultDurationMin: Number(e.target.value) })}>
            {[15, 20, 30, 45, 60].map(m => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </label>
        <div style={{ fontSize: 12, color: 'var(--relay-ink-3)', alignSelf: 'flex-end', paddingBottom: 6 }}>
          <Icon name="info" size={12} /> Times are read as clinic time ({draft.timezone}).
        </div>
      </div>

      {draft.problems.length > 0 && (
        <div className="alerts-strip" style={{ marginTop: 14, padding: '10px 14px' }}>
          <Icon name="alert" size={14} />
          <div style={{ fontSize: 12.5 }}>{draft.problems.join(' ')}</div>
        </div>
      )}
    </div>
  );
}
