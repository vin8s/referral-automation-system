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
export type Channel = 'voice' | 'sms';
export type CallOutcome =
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

export interface Attempt {
  n: number;
  timestamp: string;
  channel: Channel;
  outcome: CallOutcome;
  duration: string;
  disclosurePlayed: boolean;
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
}

export interface BookedAppointment {
  day: string;
  time: string;
  provider: string;
  confirmedBy: string;
  confirmedAt: string;
  mirrorStatus: 'mirrored' | 'pending' | 'failed';
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
  transcript: TranscriptTurn[];
  /** Channel of the latest attempt: SMS-captured slots show the text thread instead of a call transcript. */
  channel?: Channel;
  /** Last few SMS messages (SMS-captured slots only). */
  smsExcerpt?: SmsMessage[];
}

export interface UrgentAlert {
  referralId: string;
  patient: string;
  reason: string;
  severity: 'high' | 'med' | 'low';
  raisedAt: string;
  owner: string | null;
  transcriptExcerpt: TranscriptTurn[];
}

export interface CallLogEntry {
  referralId: string;
  patient: string;
  language: string;
  timestamp: string;
  attempt: number;
  channel: Channel;
  outcome: CallOutcome;
  duration: string;
  summary: string;
  hasTranscript: boolean;
  escalated: boolean;
  disclosurePlayed: boolean;
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
}

export interface PipelineCount {
  state: ReferralState;
  count: number;
}

export interface FunnelStep {
  stage: string;
  count: number;
}

export interface Analytics {
  dateRange: string;
  funnel: FunnelStep[];
  conversionLift: { baselinePct: number; currentPct: number; deltaPct: number };
  recoveredRevenue: { amount: number; currency: string; basis: string };
  backlogReactivation: { deadReferralsRun: number; recoveredVisits: number; revenue: number };
  leakageByStage: { stage: string; lostPct: number; topSource: string }[];
  shadowFidelity: {
    currentPct: number;
    trend: number[];
    threshold: number;
    status: 'below_threshold' | 'migration_ready';
    note: string;
  };
  compliance: {
    aiDisclosureRate: number;
    quietHourAdherence: number;
    optOutsHonored: number;
    voicemailPhiMinimized: number;
  };
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
  /** Server feature flag: outbound voice calls allowed (VOICE_ENABLED). */
  voiceEnabled?: boolean;
}

export interface DashboardCallActivity {
  window: string;
  avgTimeToFirstAttemptMin: number;
  metrics: DashboardCallMetric[];
}

/** Read-only practice configuration shown on the Settings screen. */
export interface RawSettings {
  cadence: { attempts: string[]; channelEscalation: string; stopRules: string[] };
  quietHours: { start: string; end: string; timezone: string };
  aiDisclosure: { locked: boolean; text: string };
  escalationTriggers: string[];
  practiceProfile: { specialty: string; providers: string[]; locations: string[]; languages: string[] };
}

export interface DashboardCallMetric {
  label: string;
  value: number;
  delta?: string;
  deltaDir?: 'up' | 'down';
  sub?: string;
  spark?: number[];
  cardDelta?: string;
}

export interface DashboardFunnelStep {
  label: string;
  n: number;
  conv: number | null;
}

export interface DashboardHealthSignals {
  status: 'normal' | 'degraded' | 'down';
  disclosureRatePct: number;
  quietHoursAdherencePct: number;
  avgTimeToFirstAttemptMin: number;
  escalationsTriggered: number;
  shadowCalendarFidelityPct: number;
  optOutsHonored: number;
}

// ── ElevenLabs Conversational AI call types ───────────────────────────────────
export interface ElevenLabsTranscriptTurn {
  role: 'agent' | 'user';
  message: string;
  time_in_call_secs?: number;
}

export interface ReferralLogEntry {
  referralId: string;
  patient: string;
  at: string;
  type: 'ai_call' | 'manual_update' | 'system';
  who: string;
  what: string;
  referralState?: ReferralState;
  detail?: string;
  channel?: Channel;
  outcome?: string;
  duration?: string;
  disclosurePlayed?: boolean;
  escalated?: boolean;
  hasTranscript?: boolean;
  attempt?: number;
}

export type CallOrderMode =
  | 'chronological'    // oldest referral first (FIFO), uncontacted only
  | 'urgent_first'     // urgent priority first, then chronological
  | 'all'              // chronological, all patients regardless of attempt count
  | 'fewest_attempts'; // least-attempted patients first

export interface CadenceConfig {
  intervalMinutes: number;
  maxCallsPerSession: number;
  callOrder: CallOrderMode;
}

export interface PracticeSettings {
  cadence: CadenceConfig;
}

export interface ElevenLabsCallResult {
  conversation_id: string;
  status: 'processing' | 'done' | 'failed';
  transcript?: ElevenLabsTranscriptTurn[];
  metadata?: {
    call_duration_secs?: number;
    start_time_unix_secs?: number;
    termination_reason?: string;
  };
  analysis?: {
    call_successful?: 'success' | 'failure' | 'unknown';
    transcript_summary?: string;
    data_collection_results?: Record<string, { value: unknown; rationale: string }>;
  };
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

export type SmsChannelPreference = 'sms' | 'voice' | 'none';

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
  /** Development only: show the "Run outreach now" button. */
  devTools: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
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
