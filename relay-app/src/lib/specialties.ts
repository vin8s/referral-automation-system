// Referral specialty: shared between the browser (ingest form, referral detail)
// and the server (SMS slot_offer phrase). Free text with these suggestions.
//
// Privacy: the specialty is shown to the patient ONLY in the time-offer text,
// after they verify their date of birth. It is never given to the AI model.

export const SPECIALTY_SUGGESTIONS = [
  'Primary care', 'Psychiatry', 'Ophthalmology', 'Dermatology', 'Cardiology', 'Endocrinology',
  'Gastroenterology', 'Neurology', 'Orthopedics', 'OB/GYN', 'Dental', 'Physical therapy',
] as const;

export const SPECIALTY_MAX_LEN = 40;

export const SPECIALTY_HELP = 'Shown to the patient only after they verify their date of birth.';

/**
 * Keeps letters (incl. accented), spaces, slash, hyphen and ampersand; drops
 * everything else (digits, dots, punctuation) so staff input can never carry a
 * phone number, link or code into a patient text. Collapses whitespace, trims,
 * and caps the length.
 */
export function sanitizeSpecialty(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/[^\p{L} /&-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()
    .slice(0, SPECIALTY_MAX_LEN)
    .trim();
}
