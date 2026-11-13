// Pure date/time helpers shared by the browser data layer and the server.
// No data, no side effects.

// Converts "2 PM" → "2:00 PM", "9 AM" → "9:00 AM", "09:00 AM" → "9:00 AM".
// Single source of truth so booked-key format always matches ALL_SLOT_TIMES.
export function normalizeTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return t.trim().toUpperCase();
  const h = parseInt(m[1], 10); // strip leading zero
  return `${h}:${m[2] ?? '00'} ${m[3].toUpperCase()}`;
}

const MONTH_A = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW_A = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Converts any date string to the "Mon Jun 8" format expected by the calendar.
// Returns null if the string cannot be parsed (entry is dropped from calendar).
export function normCalDay(raw: string): string | null {
  if (!raw || raw === 'To be confirmed') return null;
  if (/^[A-Za-z]{3} [A-Za-z]{3} \d{1,2}$/.test(raw)) return raw;
  const native = new Date(raw);
  if (!isNaN(native.getTime())) {
    return `${DOW_A[native.getDay()]} ${MONTH_A[native.getMonth()]} ${native.getDate()}`;
  }
  // Natural-language fallback: "Monday, June 8th" / "June 8" / "Jun 8th"
  const lower = raw.toLowerCase();
  let month = -1;
  for (const [name, idx] of Object.entries(MONTH_MAP)) {
    if (lower.includes(name)) { month = idx; break; }
  }
  const dayMatch = raw.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
  const dayNum = dayMatch ? parseInt(dayMatch[1], 10) : NaN;
  if (month !== -1 && !isNaN(dayNum)) {
    const d = new Date(2026, month, dayNum);
    if (!isNaN(d.getTime())) return `${DOW_A[d.getDay()]} ${MONTH_A[d.getMonth()]} ${d.getDate()}`;
  }
  return null;
}
