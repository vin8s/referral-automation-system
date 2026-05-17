// Relay — canonical TypeScript types
// State names match REFERRAL_STATUSES.md exactly.

export type ReferralState =
  | 'Ingested'
  | 'Queued'
  | 'Outreach'
  | 'Slot accepted'
  | 'Booked'
  | 'Escalated'
  | 'Closed-won'
  | 'Closed-lost';

export type Priority = 'urgent' | 'normal';
export type Channel = 'voice' | 'sms';
export type AttemptOutcome =
  | 'connected'
  | 'voicemail'
  | 'no_answer'
  | 'escalated'
  | 'declined'
  | 'accepted';

export interface TranscriptTurn {
  who: 'ai' | 'patient';
  text: string;
}

export interface Attempt {
  n: number;
  timestamp: string;
  channel: Channel;
  outcome: AttemptOutcome;
  duration: string;
  disclosurePlayed: boolean;
  summary: string;
  transcript: TranscriptTurn[];
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
  phone: string;
  language: string;
  insurance: string;
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
  visitCompletedAt?: string;
  closedLoopSent?: boolean;
  closedReason?: string;
  reactivationEligible?: boolean;
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
  outcome: AttemptOutcome;
  duration: string;
  summary: string;
  hasTranscript: boolean;
  escalated: boolean;
  disclosurePlayed: boolean;
}

export interface CalendarEvent {
  referralId: string;
  patient: string;
  day: string;
  time: string;
  provider: string;
  state: ReferralState;
  mirrorStatus: 'mirrored' | 'pending' | 'failed';
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
}
