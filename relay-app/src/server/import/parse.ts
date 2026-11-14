// eCW import: reads an uploaded .csv or .xlsx appointment report into a header
// row + string cells. Parsing happens on the server only, from memory; the file
// is never written to disk.
//
// Libraries: csv-parse (node-csv) for CSV, read-excel-file for .xlsx. The older
// `xlsx` (SheetJS) npm package is not used here: its npm release is unmaintained
// and has known advisories for untrusted input.

import 'server-only';
import { parse as parseCsv } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;   // 5 MB
export const MAX_ROWS = 5000;

export class ImportFileError extends Error {
  constructor(message: string) { super(message); this.name = 'ImportFileError'; }
}

export interface ParsedFile { headers: string[]; rows: string[][]; headerRow: number }

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Excel cell → text. Dates come back as JS Dates holding the wall-clock value in UTC:
 * date-only → "YYYY-MM-DD", time-only (Excel day 0) → "HH:MM", both → "YYYY-MM-DD HH:MM".
 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    const y = v.getUTCFullYear(), mo = v.getUTCMonth() + 1, d = v.getUTCDate();
    const h = v.getUTCHours(), mi = v.getUTCMinutes();
    const timeOnly = y < 1900 || (y === 1900 && mo === 1 && d <= 1);
    const time = `${pad(h)}:${pad(mi)}`;
    if (timeOnly) return time;
    const date = `${y}-${pad(mo)}-${pad(d)}`;
    return h || mi ? `${date} ${time}` : date;
  }
  return String(v).trim();
}

/** Report exports often have title lines above the table: the header is the first row with 3+ filled cells. */
function findHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].filter(c => c.trim()).length >= 3) return i;
  }
  return 0;
}

function finish(all: string[][]): ParsedFile {
  const nonEmpty = all.map(r => r.map(c => c ?? ''));
  if (!nonEmpty.length) throw new ImportFileError('The file is empty.');
  const h = findHeader(nonEmpty);
  const rawHeaders = nonEmpty[h].map(c => c.replace(/\s+/g, ' ').trim());
  // Unique, non-empty header names (dropdown values must be distinct).
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((x, i) => {
    const base = x || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  const rows = nonEmpty.slice(h + 1)
    .filter(r => r.some(c => c.trim()))
    .map(r => headers.map((_, i) => (r[i] ?? '').slice(0, 300)));
  if (!rows.length) throw new ImportFileError('No appointment rows found under the header row.');
  if (rows.length > MAX_ROWS) throw new ImportFileError(`Too many rows (${rows.length}). Export at most ${MAX_ROWS} rows (for example one or two weeks).`);
  return { headers, rows, headerRow: h + 1 };
}

export function fileKind(name: string): 'csv' | 'xlsx' | null {
  const n = name.toLowerCase();
  if (n.endsWith('.csv') || n.endsWith('.txt')) return 'csv';
  if (n.endsWith('.xlsx')) return 'xlsx';
  return null;
}

export async function parseScheduleFile(name: string, buf: Buffer): Promise<ParsedFile> {
  if (buf.length > MAX_FILE_BYTES) throw new ImportFileError('The file is larger than 5 MB.');
  const kind = fileKind(name);
  if (kind === 'csv') {
    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);       // Excel's UTF-8 BOM
    let records: string[][];
    try {
      records = parseCsv(text, { relax_column_count: true, skip_empty_lines: true, trim: true, bom: true }) as string[][];
    } catch {
      throw new ImportFileError('Could not read this CSV file. Export the report again as CSV (comma separated).');
    }
    return finish(records);
  }
  if (kind === 'xlsx') {
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw new ImportFileError('This is not a valid .xlsx file. In Excel use File → Save As → Excel Workbook (.xlsx), or export as CSV.');
    }
    let data: unknown[][];
    try {
      data = await readSheet(buf) as unknown[][];
    } catch {
      throw new ImportFileError('Could not read this Excel file. Save it as .xlsx or CSV and try again.');
    }
    return finish(data.map(r => r.map(cellText)));
  }
  throw new ImportFileError('Upload a .csv or .xlsx file. (Older .xls files: open in Excel and save as .xlsx or CSV.)');
}
