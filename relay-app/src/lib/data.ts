// Relay data accessor layer — the ONE seam between screens and the backend.
//
// Every screen calls these async functions. They call Relay's own server
// (route handlers under src/app/api/*), which checks the signed-in user,
// talks to Postgres (src/server/*) and writes the audit log. The browser never
// touches the database and never bundles mock data.
//
// Function names and signatures are stable: screens should not need to change
// when the server internals do.

import type {
  Referral, ReferralState, ConfirmQueue,
  OutreachLogEntry, CalendarEvent, PipelineCount,
  Org, CurrentUser,
  Priority, ReferralLogEntry, RawSettings,
  SmsThread, SmsChannelPreference, NeedsHumanItem, OutreachSettings, OutreachSettingsView, OutreachTickResult,
  EcwImportOverview, EcwImportStatus, EcwImportDraft, EcwApplyResult, EcwImportDetail,
} from './types';
import type { EcwImportOptions, EcwMapping } from './ecwImport';

// ── HTTP helper ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Signed out or session expired: go to the login screen (saying why), then come back here. */
async function goToLogin(res: Response): Promise<void> {
  const data = await res.clone().json().catch(() => ({}));
  const params = new URLSearchParams({ next: window.location.pathname + window.location.search });
  if (data?.code === 'session_expired') params.set('reason', data.reason === 'absolute' ? 'absolute' : 'idle');
  window.location.assign(`/login?${params.toString()}`);
}

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    cache: 'no-store',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    await goToLogin(res);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Mutations report { success: false } instead of throwing, as before. */
async function mutate<T extends { success: boolean }>(path: string, method: string, body?: unknown): Promise<T> {
  try {
    return await api<T>(path, { method, body });
  } catch (err) {
    return { success: false, ...(err instanceof Error ? { errorMsg: err.message } : {}) } as unknown as T;
  }
}

const ref = (id: string) => `/referrals/${encodeURIComponent(id)}`;

// ── Org / session ────────────────────────────────────────────────────────────

export async function getOrg(): Promise<Org> {
  return api<Org>('/org');
}

/** The signed-in staff member (name, role). */
export async function getCurrentUser(): Promise<CurrentUser> {
  return api<CurrentUser>('/me');
}

// ── Referrals ────────────────────────────────────────────────────────────────

export async function getReferrals(): Promise<Referral[]> {
  return api<Referral[]>('/referrals');
}

/** Opening a referral is recorded in the audit log (who viewed it, when). */
export async function getReferralById(id: string): Promise<Referral | null> {
  try {
    return await api<Referral>(ref(id));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
}

export async function getReferralsInMotion(): Promise<Referral[]> {
  return getReferrals();
}

// ── Confirm queue (the MA's single work list) ───────────────────────────────

/**
 * Everything waiting on a human, in priority order: red escalations (safety),
 * amber "needs a human" items, then AI-captured slots to confirm.
 */
export async function getConfirmQueue(): Promise<ConfirmQueue> {
  return api<ConfirmQueue>('/confirm-queue');
}

/** MA confirms an AI-captured slot they have booked in the practice system. */
export async function confirmSlot(referralId: string): Promise<{ success: boolean }> {
  return mutate(`${ref(referralId)}/confirm`, 'POST');
}

export async function rejectSlot(referralId: string): Promise<{ success: boolean }> {
  return mutate(`${ref(referralId)}/reject`, 'POST');
}

/** Claim a red escalation: the server records the signed-in user as owner. */
export async function claimEscalation(referralId: string): Promise<{ success: boolean }> {
  return mutate(`${ref(referralId)}/claim`, 'POST');
}

// ── Outreach log (text attempts) ─────────────────────────────────────────────

export async function getOutreachLog(): Promise<OutreachLogEntry[]> {
  return api<OutreachLogEntry[]>('/outreach-log');
}

// ── Calendar (read-only mirror + edits to confirmed appointments) ────────────

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  return api<CalendarEvent[]>('/calendar');
}

export async function updateCalendarEvent(
  referralId: string,
  updates: { day?: string; time?: string; provider?: string; location?: string },
): Promise<{ success: boolean }> {
  return mutate(`${ref(referralId)}/appointment`, 'PATCH', { updates });
}

export async function deleteCalendarEvent(referralId: string): Promise<{ success: boolean }> {
  return mutate(`${ref(referralId)}/appointment`, 'DELETE');
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

export async function getPipeline(): Promise<PipelineCount[]> {
  return api<PipelineCount[]>('/pipeline');
}

// ── Settings ─────────────────────────────────────────────────────────────────

/** Read-only outreach policy and practice profile. */
export async function getRawSettings(): Promise<RawSettings> {
  return api<RawSettings>('/settings/defaults');
}

// ── Sidebar counts ───────────────────────────────────────────────────────────

/** escalations = red (safety), needsHuman = amber, confirmQueue = slots to confirm. */
export async function getSidebarCounts(): Promise<{ escalations: number; needsHuman: number; confirmQueue: number; referrals: number }> {
  return api('/sidebar-counts');
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function updateReferralState(
  referralId: string,
  newState: ReferralState,
): Promise<{ success: boolean }> {
  return mutate(`${ref(referralId)}/state`, 'PUT', { state: newState });
}

export async function updateReferral(
  referralId: string,
  draft: {
    patientName?: string;
    dateOfBirth?: string;
    phone?: string;
    language?: string;
    insurance?: string;
    reason?: string;
    referringProvider?: string;
    priority?: string;
  },
  comment?: string,
): Promise<{ success: boolean }> {
  return mutate(ref(referralId), 'PATCH', { draft, comment });
}

// ── Ingest ───────────────────────────────────────────────────────────────────

export interface IngestReferralInput {
  patientName: string;
  dateOfBirth?: string;
  phone: string;
  sex?: 'M' | 'F' | '';
  language?: string;
  insurance?: string;
  reason?: string;
  specialty?: string;
  referringProvider?: string;
  priority?: Priority;
  location?: string;
  /** Only an explicit true records SMS consent. Never default this to true. */
  smsConsent?: boolean;
  /** Where consent was obtained (intake form, verbal at front desk, …). */
  smsConsentSource?: string;
}

export async function ingestReferrals(
  rows: IngestReferralInput[],
  via: 'upload' | 'manual' = 'upload',
): Promise<{ success: boolean; importedCount: number; consentedCount: number }> {
  try {
    return await api('/referrals', { method: 'POST', body: { rows, via } });
  } catch {
    return { success: false, importedCount: 0, consentedCount: 0 };
  }
}

// ── Referral log ─────────────────────────────────────────────────────────────

export async function getReferralLog(): Promise<ReferralLogEntry[]> {
  return api<ReferralLogEntry[]>('/referral-log');
}

// ── SMS texting ──────────────────────────────────────────────────────────────

/** SMS thread, consent/opt-out, conversation state and open amber items for one referral. */
export async function getSmsThread(referralId: string): Promise<SmsThread> {
  return api<SmsThread>(`${ref(referralId)}/sms`);
}

/** Staff "Send text". Held until 8 am if sent during quiet hours. */
export async function sendSmsText(referralId: string, body: string): Promise<{ success: boolean; status?: string; errorMsg?: string }> {
  return mutate(`${ref(referralId)}/sms`, 'POST', { body });
}

export async function updateSmsPreferences(
  referralId: string,
  patch: { paused?: boolean; channelPreference?: SmsChannelPreference; consent?: boolean; consentSource?: string },
): Promise<{ success: boolean; errorMsg?: string }> {
  return mutate(`${ref(referralId)}/sms`, 'PATCH', patch);
}

/** Patient simulator (prototype; SMS_PROVIDER=mock only): a fake patient reply through the real inbound flow. */
export async function simulatePatientReply(referralId: string, body: string): Promise<{ success: boolean; outcome?: string; errorMsg?: string }> {
  return mutate(`${ref(referralId)}/sms/simulate`, 'POST', { body });
}

/** Open amber "needs a human" items across all referrals. */
export async function getNeedsHumanItems(): Promise<NeedsHumanItem[]> {
  return api<NeedsHumanItem[]>('/sms/needs-human');
}

export async function resolveNeedsHumanItem(itemId: string): Promise<{ success: boolean }> {
  return mutate(`/sms/needs-human/${encodeURIComponent(itemId)}/resolve`, 'POST');
}

export async function getOutreachSettings(): Promise<OutreachSettingsView> {
  return api<OutreachSettingsView>('/sms/settings');
}

/** Admin only. Throws ApiError (status 403) for non-admins. */
export async function saveOutreachSettings(s: OutreachSettings): Promise<OutreachSettingsView> {
  return api<OutreachSettingsView>('/sms/settings', { method: 'PUT', body: s });
}

// ── eCW schedule import (connector mode: Relay reads the eCW schedule, never writes to it) ──

/** Import history, freshness status and saved column mappings. */
export async function getScheduleImports(): Promise<EcwImportOverview> {
  return api<EcwImportOverview>('/schedule-import');
}

/** When the eCW schedule was last imported (stale warning on the dashboard / confirm queue). */
export async function getScheduleImportStatus(): Promise<EcwImportStatus> {
  return api<EcwImportStatus>('/schedule-import/status');
}

/** Uploads a .csv/.xlsx eCW appointment report. Parsed on the server; returns a draft + dry-run preview. Changes nothing. */
export async function uploadScheduleFile(file: File): Promise<EcwImportDraft> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/schedule-import', { method: 'POST', body: form, cache: 'no-store' });
  if (res.status === 401 && typeof window !== 'undefined') {
    await goToLogin(res);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, typeof data?.error === 'string' ? data.error : `Upload failed (${res.status})`);
  }
  return res.json() as Promise<EcwImportDraft>;
}

/** Dry run again with adjusted column mapping / options. Changes nothing. */
export async function previewScheduleImport(importId: string, mapping: EcwMapping, options: EcwImportOptions): Promise<EcwImportDraft> {
  return api<EcwImportDraft>(`/schedule-import/${encodeURIComponent(importId)}/preview`, { method: 'POST', body: { mapping, options } });
}

/** Applies the import (optionally saving the mapping as a reusable profile). */
export async function applyScheduleImport(
  importId: string, mapping: EcwMapping, options: EcwImportOptions, saveProfileName?: string,
): Promise<EcwApplyResult> {
  return mutate<EcwApplyResult>(`/schedule-import/${encodeURIComponent(importId)}/apply`, 'POST', { mapping, options, saveProfileName });
}

export async function discardScheduleImport(importId: string): Promise<{ success: boolean }> {
  return mutate(`/schedule-import/${encodeURIComponent(importId)}`, 'DELETE');
}

export async function getScheduleImportDetail(importId: string): Promise<EcwImportDetail> {
  return api<EcwImportDetail>(`/schedule-import/${encodeURIComponent(importId)}`);
}

/** Staff decision on a review row: match it to a referral, or ignore it. */
export async function resolveScheduleReviewItem(
  itemId: string, decision: { action: 'match'; referralId: string } | { action: 'ignore' },
): Promise<{ success: boolean; outcome?: string; errorMsg?: string }> {
  return mutate(`/schedule-import/review/${encodeURIComponent(itemId)}`, 'POST', decision);
}

/** Admin only: run the outreach scheduler once now (the same job EventBridge runs on a schedule). */
export async function runOutreachNow(): Promise<OutreachTickResult> {
  return api<OutreachTickResult>('/sms/outreach/tick', { method: 'POST' });
}
