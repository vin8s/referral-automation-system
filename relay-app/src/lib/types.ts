// Relay — canonical TypeScript types
// State names match REFERRAL_STATUSES.md exactly.

import type { EcwImportOptions, EcwMapping } from './ecwImport';

export type ReferralState =
  | 'Queued'
  | 'In Progress'
  | 'Attempted'
  | 'Pending Confirmation'
  | 'Booked'
  | 'Escalated';

export type Priority = 'urgent' | 'normal';
/**
 * Outcome of one text-outreach attempt (stored in call_attempts.outcome; the
 * table keeps its historical name). Display labels: outcomeLabel() in format.ts.
 */
export type OutreachOutcome =
  | 'No Answer'
  | 'Voicemail Left'
  | 'Call Back Requested'
  | 'Identity Verified'
  | 'Interested'
  | 'Appointment Accepted'
  | 'Booked'
  | 'Transferred to Staff'
  | 'Declined Referral'
  | 'Wrong Number'
  | 'Language Barrier'
  | 'Disconnected'
  | 'Escalated';

export interface TranscriptTurn {
  who: 'ai' | 'patient';
  text: string;
}

/** One text-outreach attempt (Relay is SMS-only). */
export interface Attempt {
  n: number;
  timestamp: string;
  outcome: OutreachOutcome;
  summary: string;
  transcript: TranscriptTurn[];
  slotDay?: string;
}

export interface AuditEntry {
  at: string;
  who: string;
  what: string;
}

export interface CapturedSlot {
  day: string;
  time: string;
  provider: string;
  capturedAgoMin: number | null;
  /** Epic sandbox prototype: this time came from Epic $find. */
  epic?: boolean;
}

export interface BookedAppointment {
  day: string;
  time: string;
  provider: string;
  confirmedBy: string;
  confirmedAt: string;
  mirrorStatus: 'mirrored' | 'pending' | 'failed';
  /** Epic sandbox prototype: the appointment Relay booked in Epic. */
  epicAppointmentId?: string;
}

export interface Patient {
  name: string;
  age: number;
  sex: 'M' | 'F';
  dateOfBirth: string;
  phone: string;
  language: string;
  insurance: string;
  /** eCW MRN / Account No (used to match the eCW schedule import). */
  mrn?: string;
}

export interface Escalation {
  reason: string;
  severity: 'high' | 'med' | 'low';
  raisedAt: string;
  owner: string | null;
}

export interface Referral {
  id: string;
  patient: Patient;
  reason: string;
  /** Appointment specialty (e.g. "Primary care"). Texted only after DOB verification. */
  specialty?: string;
  referringProvider: string;
  referralSource: string;
  referralTime: string;
  location: string;
  priority: Priority;
  state: ReferralState;
  capturedSlot: CapturedSlot | null;
  bookedAppointment?: BookedAppointment;
  escalation?: Escalation;
  attempts: Attempt[];
  audit: AuditEntry[];
}

// Derived view types used by screens
export interface ConfirmQueueItem {
  referralId: string;
  patient: string;
  age: number;
  sex: string;
  reason: string;
  referringProvider: string;
  language: string;
  insurance: string;
  slot: CapturedSlot;
  capturedAgoMin: number | null;
  priority: Priority;
  summary: string;
  /** Last few SMS messages of the thread. */
  smsExcerpt?: SmsMessage[];
  /** Epic sandbox prototype: Confirm will book this slot in Epic ($book). */
  epicBooking?: boolean;
}

/** Red Escalated referral (safety). Never merged with amber NeedsHumanItem. */
export interface EscalationItem {
  referralId: string;
  patient: string;
  reason: string;
  severity: 'high' | 'med' | 'low';
  raisedAt: string;
  owner: string | null;
  /** Last two turns of the text conversation that triggered it. */
  excerpt: TranscriptTurn[];
}

/**
 * The MA's single work list (/action), top to bottom:
 * red escalations → amber "needs a human" items → slots to confirm.
 */
export interface ConfirmQueue {
  escalations: EscalationItem[];
  needsHuman: NeedsHumanItem[];
  slots: ConfirmQueueItem[];
}

export interface OutreachLogEntry {
  referralId: string;
  patient: string;
  language: string;
  timestamp: string;
  attempt: number;
  outcome: OutreachOutcome;
  summary: string;
  escalated: boolean;
  referralState: ReferralState;
}

export interface CalendarEvent {
  referralId: string;
  patient: string;
  day: string;
  time: string;
  provider: string;
  location: string;
  reason: string;
  state: ReferralState;
  mirrorStatus: 'mirrored' | 'pending' | 'failed';
  isShadow: boolean;
  /** Epic sandbox prototype: booked in Epic by Relay after the MA confirmed. */
  bookedInEpic?: boolean;
}

export interface PipelineCount {
  state: ReferralState;
  count: number;
}

export interface Org {
  productName: string;
  practiceName: string;
  site: string;
  environment: string;
  specialty: string;
}

export interface CurrentUser {
  name: string;
  fullName: string;
  role: string;
  initials: string;
  today: string;
  /** Session user id (Cognito sub or mock id). */
  id?: string;
  /** Machine role used for permissions. */
  roleKey?: 'ma' | 'admin';
}

/** Read-only practice configuration shown on the Settings screen. */
export interface RawSettings {
  cadence: { attempts: string[]; channelEscalation: string; stopRules: string[] };
  quietHours: { start: string; end: string; timezone: string };
  aiDisclosure: { locked: boolean; text: string };
  escalationTriggers: string[];
  practiceProfile: { specialty: string; providers: string[]; locations: string[]; languages: string[] };
}

export interface ReferralLogEntry {
  referralId: string;
  patient: string;
  at: string;
  type: 'outreach' | 'manual_update' | 'system';
  who: string;
  what: string;
  referralState?: ReferralState;
  detail?: string;
  outcome?: string;
  escalated?: boolean;
  attempt?: number;
}

// ── SMS texting (pilot channel) ───────────────────────────────────────────────

export type SmsMessageStatus = 'received' | 'held' | 'sending' | 'sent' | 'delivered' | 'failed' | 'suppressed';

export interface SmsMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  /** Who wrote it: the patient, a fixed template, the AI, a staff member, or the system. */
  author: 'patient' | 'template' | 'ai' | 'staff' | 'system';
  body: string;
  templateKey: string | null;
  status: SmsMessageStatus;
  /** Clinic-local display time. */
  at: string;
  /** For held messages: when it will go out (clinic-local display time). */
  sendAfter: string | null;
  segments: number | null;
  sentBy: string | null;
  /** Why a message was suppressed / failed. */
  note: string | null;
}

/** Amber "needs a human" item. Separate from the red Escalated state; never changes the referral state. */
export interface NeedsHumanItem {
  id: string;
  referralId: string;
  patient: string;
  reasonCode: string;
  reasonLabel: string;
  summary: string | null;
  pauseAutomation: boolean;
  raisedAt: string;
}

/** 'sms' = automated texting allowed; 'none' = staff contact only (no automated texts). */
export type SmsChannelPreference = 'sms' | 'none';

export interface SmsThread {
  referralId: string;
  messages: SmsMessage[];
  conversation: {
    language: 'en' | 'es' | null;
    identityVerified: boolean;
    identityAttempts: number;
    paused: boolean;
    pausedReason: string | null;
    channelPreference: SmsChannelPreference;
    numberSuppressed: boolean;
    outreachCount: number;
    lifetimeCap: number;
    /** Next outreach template, or null when the cycle is done / patient replied. */
    nextStep: string | null;
    exhausted: boolean;
    offeredSlots: string[];
  };
  consent: {
    consent: boolean;
    consentAt: string | null;
    consentSource: string | null;
    optedOut: boolean;
    optedOutAt: string | null;
    optOutSource: string | null;
  };
  needsHuman: NeedsHumanItem[];
  textingPaused: boolean;
  /** SMS_PROVIDER=mock: the "Patient simulator (prototype)" box is available. */
  simulatorEnabled: boolean;
  provider: 'mock' | 'aws' | 'twilio';
  aiProvider: 'mock' | 'bedrock';
}

export interface OutreachSettings {
  textingPaused: boolean;
  /** Pilot mode: staff approve each referral (dashboard "Ready to text") before its first text. */
  approvalRequired: boolean;
  quietStart: string;
  quietEnd: string;
  allowedDays: number[];
  holidays: string[];
  cadenceDays: number[];
  lifetimeCap: number;
  minSpacingHours: number;
  exhaustedAfterHours: number;
  aiDailyCap: number;
}

export interface OutreachSettingsView {
  settings: OutreachSettings;
  provider: 'mock' | 'aws' | 'twilio';
  aiProvider: 'mock' | 'bedrock';
  timezone: string;
  /** True outside production (development-only tools such as the patient simulator). */
  devTools: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** A referral waiting for staff approval before its first text (pilot mode). */
export interface ReadyToTextItem {
  referralId: string;
  patient: string;
  phone: string;
  language: string;
  specialty: string;
  priority: Priority;
  receivedAt: string;
  /** null = can be texted once approved; otherwise why it can't be texted yet. */
  blocked: string | null;
}

export interface ReadyToTextView {
  approvalRequired: boolean;
  items: ReadyToTextItem[];
}

export interface OutreachTickResult {
  paused: boolean;
  inWindow: boolean;
  sent: number;
  heldReleased: number;
  amber: number;
  skipped: Record<string, number>;
}

// ── eCW schedule import ─────────────────────────────────────────────────────

export type EcwAction =
  | 'book' | 'update_time' | 'record_visit'
  | 'reenter_cancelled' | 'reenter_no_show' | 'reenter_rescheduled'
  | 'none' | 'review' | 'ignore' | 'invalid';

export interface EcwImportCounts {
  total: number; matched: number; booked: number; updated: number; visits: number;
  reentered: number; review: number; ignored: number; invalid: number; unchanged: number;
}

export interface EcwCandidate { referralId: string; patient: string; dob: string; state: ReferralState }

export interface EcwPreviewRow {
  rowNumber: number;
  patient: string;
  dob: string | null;
  mrn: string | null;
  date: string | null;          // "Tue Nov 17, 2026"
  time: string | null;          // "10:30 AM"
  provider: string | null;
  status: string;               // eCW status as written (or category label)
  referralId: string | null;
  referralPatient: string | null;
  referralState: ReferralState | null;
  matchLabel: string | null;    // "MRN", "DOB + name", …
  confidence: 'high' | 'medium' | null;
  action: EcwAction;
  actionLabel: string;
  detail: string;
  candidates?: EcwCandidate[];
}

export interface EcwImportPreview {
  rows: EcwPreviewRow[];
  counts: EcwImportCounts;
  rangeStart: string | null;    // "Nov 16, 2026"
  rangeEnd: string | null;
  providers: string[];
  defaultBusyProviders: string[];
}

export interface EcwImportDraft {
  importId: string;
  fileName: string;
  rowCount: number;
  headers: string[];
  sample: string[][];
  mapping: EcwMapping;
  options: EcwImportOptions;
  profileName: string | null;
  problems: string[];
  preview: EcwImportPreview | null;
  /** This exact file was already applied before (re-imports are safe; nothing changes twice). */
  alreadyApplied: { at: string; by: string } | null;
  timezone: string;
}

export interface EcwApplyResult {
  success: boolean;
  importId?: string;
  counts?: EcwImportCounts;
  openReview?: number;
  errorMsg?: string;
}

export interface EcwImportSummary {
  id: string;
  fileName: string;
  status: 'draft' | 'applied' | 'discarded' | 'expired';
  createdAt: string;
  createdBy: string;
  appliedAt: string | null;
  appliedBy: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  counts: EcwImportCounts | null;
  openReview: number;
}

export interface EcwReviewItem {
  id: string;
  importId: string;
  rowNumber: number;
  reason: string;
  reasonLabel: string;
  detail: string;
  row: { patient: string; dob: string | null; mrn: string | null; date: string | null; time: string | null; provider: string | null; status: string };
  candidates: EcwCandidate[];
  status: 'open' | 'matched' | 'ignored';
  outcome: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface EcwImportStatus {
  lastAppliedAt: string | null;
  lastAppliedBy: string | null;
  stale: boolean;
  never: boolean;
  hoursAgo: number | null;
  staleHours: number;
  openReview: number;
}

export interface EcwImportOverview {
  imports: EcwImportSummary[];
  status: EcwImportStatus;
  profiles: { id: string; name: string; updatedAt: string; updatedBy: string | null }[];
}

export interface EcwImportDetail { summary: EcwImportSummary; review: EcwReviewItem[] }
