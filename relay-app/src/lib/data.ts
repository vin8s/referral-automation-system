// Relay data accessor layer — Supabase backend (phase 2).
// Every screen calls these async functions. No screen-level code changes needed.

import { supabase } from './supabase';
import {
  org as _org,
  currentUser as _currentUser,
  analytics as _analytics,
  dashboardCallActivity as _callActivity,
  dashboardFunnel as _dashboardFunnel,
  settingsDefaults as _settings,
  referrals as _referrals,
} from './mockData';

const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co';
import type {
  Referral, ReferralState, Attempt, ConfirmQueueItem, UrgentAlert,
  CallLogEntry, CalendarEvent, PipelineCount, Analytics,
  Org, CurrentUser, DashboardFunnelStep, DashboardHealthSignals,
  Priority, ReferralLogEntry, Channel, CallOutcome,
} from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function parseDurationToSecs(duration: string): number {
  if (!duration || duration === '—') return 0;
  const mMatch = duration.match(/(\d+)m/);
  const sMatch = duration.match(/(\d+)s/);
  return (mMatch ? parseInt(mMatch[1]) * 60 : 0) + (sMatch ? parseInt(sMatch[1]) : 0);
}

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  ) age--;
  return age;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function fmtDob(dob: string): string {
  if (!dob) return '';
  const [y, m, d] = dob.split('-');
  return `${m}/${d}/${y}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReferral(row: any): Referral {
  const patient = row.patients;

  const attempts: Attempt[] = (row.call_attempts ?? [])
    .slice()
    .sort((a: any, b: any) => new Date(a.attempted_at).getTime() - new Date(b.attempted_at).getTime())
    .map((a: any, idx: number): Attempt => ({
      n: idx + 1,
      timestamp: fmtDate(a.attempted_at),
      channel: a.channel as Channel,
      outcome: a.outcome as CallOutcome,
      duration: fmtDuration(a.duration_secs),
      disclosurePlayed: a.disclosure_played ?? false,
      summary: a.summary ?? '',
      transcript: Array.isArray(a.transcript) ? a.transcript : [],
      ...(a.slot_day ? { slotDay: a.slot_day } : {}),
    }));

  const capturedAppt = (row.appointments ?? []).find((a: any) => a.status === 'captured');
  const confirmedAppt = (row.appointments ?? []).find((a: any) => a.status === 'confirmed');

  return {
    id: row.id,
    patient: {
      name: patient.name,
      age: calcAge(patient.date_of_birth),
      sex: patient.sex as 'M' | 'F',
      dateOfBirth: fmtDob(patient.date_of_birth),
      phone: patient.phone,
      language: patient.language,
      insurance: patient.insurance,
    },
    reason: row.reason ?? '',
    referringProvider: row.referring_provider ?? '',
    referralSource: row.referral_source ?? '',
    referralTime: fmtDate(row.referral_time),
    location: row.location ?? '',
    priority: row.priority as Priority,
    state: row.state as ReferralState,
    capturedSlot: capturedAppt ? {
      day: capturedAppt.day,
      time: capturedAppt.time,
      provider: capturedAppt.provider,
      capturedAgoMin: Math.floor(
        (Date.now() - new Date(capturedAppt.captured_at).getTime()) / 60000,
      ),
    } : null,
    bookedAppointment: confirmedAppt ? {
      day: confirmedAppt.day,
      time: confirmedAppt.time,
      provider: confirmedAppt.provider,
      confirmedBy: 'Staff',
      confirmedAt: confirmedAppt.confirmed_at ? fmtDate(confirmedAppt.confirmed_at) : '',
      mirrorStatus: confirmedAppt.mirror_status as 'mirrored' | 'pending' | 'failed',
    } : undefined,
    escalation: row.escalation_reason ? {
      reason: row.escalation_reason,
      severity: row.escalation_severity as 'high' | 'med' | 'low',
      raisedAt: row.escalation_raised_at ? fmtDate(row.escalation_raised_at) : '',
      owner: null,
    } : undefined,
    attempts,
    audit: (row.audit_log ?? [])
      .slice()
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((e: any) => ({
        at: fmtDate(e.created_at),
        who: e.user_id ? 'Staff' : 'System',
        what: e.what,
      })),
  };
}

const REFERRAL_SELECT = `*, patients(*), call_attempts(*), appointments(*), audit_log(*)`;

// ── Org / session ─────────────────────────────────────────────────────────────

export async function getOrg(): Promise<Org> {
  return _org;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return _currentUser;
}

// ── Referrals ─────────────────────────────────────────────────────────────────

export async function getReferrals(): Promise<Referral[]> {
  if (USE_MOCK) return _referrals;
  const { data, error } = await supabase
    .from('referrals')
    .select(REFERRAL_SELECT)
    .order('referral_time', { ascending: false });
  if (error || !data) return _referrals;
  return data.map(mapReferral);
}

export async function getReferralById(id: string): Promise<Referral | null> {
  if (USE_MOCK) return _referrals.find(r => r.id === id) ?? null;
  const { data, error } = await supabase
    .from('referrals')
    .select(REFERRAL_SELECT)
    .eq('id', id)
    .single();
  if (error || !data) return _referrals.find(r => r.id === id) ?? null;
  return mapReferral(data);
}

export async function getReferralsInMotion(): Promise<Referral[]> {
  return getReferrals();
}

// ── Confirm queue ─────────────────────────────────────────────────────────────

const PLACEHOLDER_SLOT = { day: 'To be confirmed', time: 'TBD', provider: 'TBD', capturedAgoMin: null };

function toConfirmQueueItem(r: Referral): ConfirmQueueItem {
  const slot = r.capturedSlot ?? PLACEHOLDER_SLOT;
  return {
    referralId: r.id,
    patient: r.patient.name,
    age: r.patient.age,
    sex: r.patient.sex,
    reason: r.reason,
    referringProvider: r.referringProvider,
    language: r.patient.language,
    insurance: r.patient.insurance,
    slot,
    capturedAgoMin: slot.capturedAgoMin,
    priority: r.priority,
    summary: r.attempts[r.attempts.length - 1]?.summary ?? '',
    transcript: r.attempts[r.attempts.length - 1]?.transcript ?? [],
  };
}

export async function getConfirmQueue(): Promise<ConfirmQueueItem[]> {
  if (USE_MOCK) {
    return _referrals
      .filter(r => r.state === 'Pending Confirmation')
      .map(toConfirmQueueItem);
  }
  const { data, error } = await supabase
    .from('referrals')
    .select(REFERRAL_SELECT)
    .eq('state', 'Pending Confirmation')
    .order('referral_time', { ascending: true });
  if (error || !data) return [];
  return data.map(mapReferral).map(toConfirmQueueItem);
}

export async function confirmSlot(referralId: string): Promise<{ success: boolean }> {
  if (USE_MOCK) {
    const ref = _referrals.find(r => r.id === referralId);
    if (ref && ref.capturedSlot) {
      const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      ref.bookedAppointment = {
        day: ref.capturedSlot.day,
        time: ref.capturedSlot.time,
        provider: ref.capturedSlot.provider,
        confirmedBy: 'Priya Anand',
        confirmedAt: now,
        mirrorStatus: 'mirrored',
      };
      ref.capturedSlot = null;
      ref.state = 'Booked';
    }
    return { success: true };
  }
  const now = new Date().toISOString();
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase
      .from('appointments')
      .update({ status: 'confirmed', confirmed_at: now, mirror_status: 'mirrored' })
      .eq('referral_id', referralId)
      .eq('status', 'captured'),
    supabase
      .from('referrals')
      .update({ state: 'Booked', updated_at: now })
      .eq('id', referralId),
  ]);
  await supabase.from('audit_log').insert({ referral_id: referralId, what: 'Slot confirmed in practice system' });
  return { success: !e1 && !e2 };
}

export async function rejectSlot(referralId: string): Promise<{ success: boolean }> {
  if (USE_MOCK) {
    const ref = _referrals.find(r => r.id === referralId);
    if (ref) {
      ref.capturedSlot = null;
      ref.state = 'In Progress';
    }
    return { success: true };
  }
  const now = new Date().toISOString();
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase
      .from('appointments')
      .update({ status: 'expired' })
      .eq('referral_id', referralId)
      .eq('status', 'captured'),
    supabase
      .from('referrals')
      .update({ state: 'In Progress', updated_at: now })
      .eq('id', referralId),
  ]);
  await supabase.from('audit_log').insert({ referral_id: referralId, what: 'Slot rejected — re-entering outreach' });
  return { success: !e1 && !e2 };
}

// ── Urgent alerts ─────────────────────────────────────────────────────────────

export async function getUrgentAlerts(): Promise<UrgentAlert[]> {
  if (USE_MOCK) {
    return _referrals
      .filter(r => r.state === 'Escalated' && r.escalation)
      .map(r => ({
        referralId: r.id,
        patient: r.patient.name,
        reason: r.escalation!.reason,
        severity: r.escalation!.severity,
        raisedAt: r.escalation!.raisedAt,
        owner: r.escalation!.owner,
        transcriptExcerpt: r.attempts[r.attempts.length - 1]?.transcript?.slice(-2) ?? [],
      }));
  }
  const { data, error } = await supabase
    .from('referrals')
    .select(REFERRAL_SELECT)
    .eq('state', 'Escalated');
  if (error || !data) return [];
  return data
    .map(mapReferral)
    .filter(r => r.escalation)
    .map(r => ({
      referralId: r.id,
      patient: r.patient.name,
      reason: r.escalation!.reason,
      severity: r.escalation!.severity,
      raisedAt: r.escalation!.raisedAt,
      owner: r.escalation!.owner,
      transcriptExcerpt: r.attempts[r.attempts.length - 1]?.transcript?.slice(-2) ?? [],
    }));
}

export async function claimAlert(referralId: string, ownerName: string): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('audit_log')
    .insert({ referral_id: referralId, what: `Alert claimed by ${ownerName}` });
  return { success: !error };
}

// ── Call log ──────────────────────────────────────────────────────────────────

export async function getCallLog(): Promise<CallLogEntry[]> {
  if (USE_MOCK) {
    const entries: CallLogEntry[] = [];
    for (const r of _referrals) {
      for (const a of r.attempts) {
        entries.push({
          referralId: r.id,
          patient: r.patient.name,
          language: r.patient.language,
          timestamp: a.timestamp,
          attempt: a.n,
          channel: a.channel,
          outcome: a.outcome,
          duration: a.duration,
          summary: a.summary,
          hasTranscript: a.transcript.length > 0,
          escalated: a.outcome === 'Escalated',
          disclosurePlayed: a.disclosurePlayed,
          referralState: r.state,
        });
      }
    }
    return entries.reverse();
  }
  const { data, error } = await supabase
    .from('call_attempts')
    .select('*, referrals(id, state, patients(name, language))')
    .order('attempted_at', { ascending: false });
  if (error || !data) return [];

  // Compute per-referral attempt numbers
  const byReferral: Record<string, string[]> = {};
  for (const a of [...data].sort((x: any, y: any) =>
    new Date(x.attempted_at).getTime() - new Date(y.attempted_at).getTime()
  )) {
    (byReferral[a.referral_id] ??= []).push(a.id);
  }

  return data.map((a: any) => ({
    referralId: a.referral_id,
    patient: a.referrals?.patients?.name ?? '—',
    language: a.referrals?.patients?.language ?? '',
    timestamp: fmtDate(a.attempted_at),
    attempt: (byReferral[a.referral_id] ?? []).indexOf(a.id) + 1,
    channel: a.channel as Channel,
    outcome: a.outcome as CallOutcome,
    duration: fmtDuration(a.duration_secs),
    summary: a.summary ?? '',
    hasTranscript: Array.isArray(a.transcript) && a.transcript.length > 0,
    escalated: a.outcome === 'Escalated',
    disclosurePlayed: a.disclosure_played ?? false,
    referralState: (a.referrals?.state ?? 'Queued') as ReferralState,
  }));
}

// ── Calendar ──────────────────────────────────────────────────────────────────

// ── Calendar day normalizer ───────────────────────────────────────────────────
// Converts any date string to "Mon Jun 8" format expected by parseEventDate.
// Returns null if the string cannot be parsed (entry is dropped from calendar).

const _MONTH_A = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _DOW_A   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _MONTH_MAP: Record<string, number> = {
  january:0,february:1,march:2,april:3,may:4,june:5,
  july:6,august:7,september:8,october:9,november:10,december:11,
  jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
};

function normCalDay(raw: string): string | null {
  if (!raw || raw === 'To be confirmed') return null;
  // Already "Mon Jun 8"
  if (/^[A-Za-z]{3} [A-Za-z]{3} \d{1,2}$/.test(raw)) return raw;
  // Try native Date parse ("June 8, 2026", "2026-06-08", etc.)
  const native = new Date(raw);
  if (!isNaN(native.getTime())) {
    return `${_DOW_A[native.getDay()]} ${_MONTH_A[native.getMonth()]} ${native.getDate()}`;
  }
  // Natural-language fallback: "Monday, June 8th" / "June 8" / "Jun 8th"
  const lower = raw.toLowerCase();
  let month = -1;
  for (const [name, idx] of Object.entries(_MONTH_MAP)) {
    if (lower.includes(name)) { month = idx; break; }
  }
  const dayMatch = raw.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
  const dayNum = dayMatch ? parseInt(dayMatch[1], 10) : NaN;
  if (month !== -1 && !isNaN(dayNum)) {
    const d = new Date(2026, month, dayNum);
    if (!isNaN(d.getTime())) return `${_DOW_A[d.getDay()]} ${_MONTH_A[d.getMonth()]} ${d.getDate()}`;
  }
  return null;
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  if (USE_MOCK) {
    const events: CalendarEvent[] = [];
    for (const r of _referrals) {
      if (r.bookedAppointment) {
        const day = normCalDay(r.bookedAppointment.day);
        if (day) events.push({
          referralId: r.id,
          patient: r.patient.name,
          day,
          time: r.bookedAppointment.time,
          provider: r.bookedAppointment.provider,
          location: r.location,
          reason: r.reason,
          state: r.state,
          mirrorStatus: r.bookedAppointment.mirrorStatus,
          isShadow: false,
        });
      }
      if (r.capturedSlot) {
        const day = normCalDay(r.capturedSlot.day);
        if (day) events.push({
          referralId: r.id,
          patient: r.patient.name,
          day,
          time: r.capturedSlot.time,
          provider: r.capturedSlot.provider,
          location: r.location,
          reason: r.reason,
          state: r.state,
          mirrorStatus: 'pending',
          isShadow: true,
        });
      }
    }
    return events;
  }
  const { data, error } = await supabase
    .from('appointments')
    .select('*, referrals(id, location, reason, state, patients(name))')
    .in('status', ['confirmed', 'captured'])
    .order('day', { ascending: true });
  if (error || !data) return [];
  return data
    .map((a: any) => {
      const day = normCalDay(a.day);
      if (!day) return null;
      return {
        referralId: a.referral_id,
        patient: a.referrals?.patients?.name ?? '—',
        day,
        time: a.time,
        provider: a.provider,
        location: a.referrals?.location ?? '',
        reason: a.referrals?.reason ?? '',
        state: a.referrals?.state as ReferralState,
        mirrorStatus: a.mirror_status as 'mirrored' | 'pending' | 'failed',
        isShadow: a.status === 'captured',
      };
    })
    .filter((e): e is CalendarEvent => e !== null);
}

// ── Pipeline / analytics ──────────────────────────────────────────────────────

export async function getPipeline(): Promise<PipelineCount[]> {
  const states: ReferralState[] = ['Queued', 'In Progress', 'Pending Confirmation', 'Booked', 'Escalated'];
  if (USE_MOCK) {
    return states.map(s => ({ state: s, count: _referrals.filter(r => r.state === s).length }));
  }
  const { data, error } = await supabase.from('referrals').select('state');
  if (error || !data) return states.map(s => ({ state: s, count: 0 }));
  return states.map(s => ({
    state: s,
    count: data.filter((r: any) => r.state === s).length,
  }));
}

export async function getAnalytics(): Promise<Analytics> {
  return _analytics;
}

export async function getDashboardCallActivity() {
  return _callActivity;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings() {
  return _settings;
}

// ── Sidebar counts ────────────────────────────────────────────────────────────

export async function getSidebarCounts(): Promise<{ urgentAlerts: number; confirmQueue: number; referrals: number }> {
  if (USE_MOCK) {
    return {
      urgentAlerts: _referrals.filter(r => r.state === 'Escalated').length,
      confirmQueue: _referrals.filter(r => r.state === 'Pending Confirmation').length,
      referrals: _referrals.filter(r => r.state !== 'Booked').length,
    };
  }
  const { data, error } = await supabase.from('referrals').select('state');
  if (error || !data) return { urgentAlerts: 0, confirmQueue: 0, referrals: 0 };
  return {
    urgentAlerts: data.filter((r: any) => r.state === 'Escalated').length,
    confirmQueue: data.filter((r: any) => r.state === 'Pending Confirmation').length,
    referrals: data.filter((r: any) => r.state !== 'Booked').length,
  };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function updateReferralState(
  referralId: string,
  newState: ReferralState,
): Promise<{ success: boolean }> {
  if (USE_MOCK) {
    const ref = _referrals.find(r => r.id === referralId);
    if (ref) ref.state = newState;
    return { success: true };
  }
  const { error } = await supabase
    .from('referrals')
    .update({ state: newState, updated_at: new Date().toISOString() })
    .eq('id', referralId);
  await supabase.from('audit_log').insert({
    referral_id: referralId,
    what: `State updated to ${newState}`,
  });
  return { success: !error };
}

export async function createCapturedSlot(
  referralId: string,
  slot: { day: string; time: string; provider: string },
): Promise<{ success: boolean }> {
  if (USE_MOCK) {
    const ref = _referrals.find(r => r.id === referralId);
    if (ref) ref.capturedSlot = { ...slot, capturedAgoMin: 0 };
    return { success: true };
  }
  const { error } = await supabase.from('appointments').insert({
    referral_id: referralId,
    status: 'captured',
    day: slot.day,
    time: slot.time,
    provider: slot.provider,
    captured_at: new Date().toISOString(),
    mirror_status: 'pending',
  });
  return { success: !error };
}

export async function addCallAttempt(
  referralId: string,
  attempt: Omit<Attempt, 'n'>,
): Promise<{ success: boolean; errorMsg?: string }> {
  if (USE_MOCK) {
    const ref = _referrals.find(r => r.id === referralId);
    if (ref) {
      ref.attempts = [...ref.attempts, { ...attempt, n: ref.attempts.length + 1 }];
    }
    return { success: true };
  }
  const { error } = await supabase.from('call_attempts').insert({
    referral_id: referralId,
    channel: attempt.channel,
    outcome: attempt.outcome,
    duration_secs: parseDurationToSecs(attempt.duration),
    disclosure_played: attempt.disclosurePlayed,
    summary: attempt.summary,
    transcript: attempt.transcript,
  });
  if (error) {
    console.error('[addCallAttempt] Supabase insert error:', error);
    return { success: false, errorMsg: error.message };
  }
  await supabase.from('audit_log').insert({
    referral_id: referralId,
    what: `${attempt.channel === 'voice' ? 'Voice' : 'SMS'} call: ${attempt.outcome} · ${attempt.duration}`,
  });
  return { success: true };
}

// Updates the most recently inserted call attempt for a referral with a late-arriving transcript.
export async function patchLatestTranscript(
  referralId: string,
  turns: { who: 'ai' | 'patient'; text: string }[],
): Promise<void> {
  if (USE_MOCK) {
    const ref = _referrals.find(r => r.id === referralId);
    if (ref && ref.attempts.length > 0) {
      const last = ref.attempts[ref.attempts.length - 1];
      if (!last.transcript.length) last.transcript = turns;
    }
    return;
  }
  const { data } = await supabase
    .from('call_attempts')
    .select('id')
    .eq('referral_id', referralId)
    .order('attempted_at', { ascending: false })
    .limit(1)
    .single();
  if (data?.id) {
    await supabase.from('call_attempts').update({ transcript: turns }).eq('id', data.id);
  }
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
  const { data: ref } = await supabase
    .from('referrals')
    .select('patient_id')
    .eq('id', referralId)
    .single();
  if (!ref) return { success: false };

  const patientUpdates: Record<string, string> = {};
  if (draft.patientName) patientUpdates.name = draft.patientName;
  if (draft.phone)       patientUpdates.phone = draft.phone;
  if (draft.language)    patientUpdates.language = draft.language;
  if (draft.insurance)   patientUpdates.insurance = draft.insurance;
  if (draft.dateOfBirth) {
    const [m, d, y] = draft.dateOfBirth.split('/');
    patientUpdates.date_of_birth = `${y}-${m}-${d}`;
  }

  const referralUpdates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (draft.reason)            referralUpdates.reason = draft.reason;
  if (draft.referringProvider) referralUpdates.referring_provider = draft.referringProvider;
  if (draft.priority)          referralUpdates.priority = draft.priority;

  const auditLines: string[] = [];
  if (draft.patientName)       auditLines.push(`Name → ${draft.patientName}`);
  if (draft.phone)             auditLines.push(`Phone → ${draft.phone}`);
  if (draft.language)          auditLines.push(`Language → ${draft.language}`);
  if (draft.insurance)         auditLines.push(`Insurance → ${draft.insurance}`);
  if (draft.dateOfBirth)       auditLines.push(`DOB → ${draft.dateOfBirth}`);
  if (draft.reason)            auditLines.push(`Reason → ${draft.reason}`);
  if (draft.referringProvider) auditLines.push(`Provider → ${draft.referringProvider}`);
  if (draft.priority)          auditLines.push(`Priority → ${draft.priority}`);
  if (comment?.trim())         auditLines.push(`Comment: ${comment.trim()}`);

  await supabase.from('referrals').update(referralUpdates).eq('id', referralId);
  if (Object.keys(patientUpdates).length > 0) {
    await supabase.from('patients').update(patientUpdates).eq('id', ref.patient_id);
  }
  if (auditLines.length > 0) {
    await supabase.from('audit_log').insert({
      referral_id: referralId,
      what: `Manual edit — ${auditLines.join(' · ')}`,
    });
  }
  return { success: true };
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export interface IngestReferralInput {
  patientName: string;
  dateOfBirth?: string;
  phone: string;
  sex?: 'M' | 'F' | '';
  language?: string;
  insurance?: string;
  reason?: string;
  referringProvider?: string;
  priority?: Priority;
  location?: string;
}

export async function ingestReferrals(
  rows: IngestReferralInput[],
): Promise<{ success: boolean; importedCount: number }> {
  if (USE_MOCK) {
    const maxId = _referrals.reduce((max, r) => {
      const n = parseInt(r.id.replace('REF-', ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 1042);

    const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    rows.forEach((row, i) => {
      const id = `REF-${maxId + i + 1}`;
      const dobIso = row.dateOfBirth
        ? (() => { const [m, d, y] = row.dateOfBirth!.split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; })()
        : '';
      _referrals.unshift({
        id,
        patient: {
          name: row.patientName,
          age: dobIso ? calcAge(dobIso) : 0,
          sex: (row.sex === 'M' || row.sex === 'F') ? row.sex : 'M',
          dateOfBirth: row.dateOfBirth ?? '',
          phone: row.phone,
          language: row.language ?? 'English',
          insurance: row.insurance ?? '',
        },
        reason: row.reason ?? '',
        referringProvider: row.referringProvider ?? '',
        referralSource: 'Uploaded batch',
        referralTime: now,
        location: row.location ?? '',
        priority: row.priority ?? 'normal',
        state: 'Queued',
        capturedSlot: null,
        attempts: [],
        audit: [{ at: now, who: 'Staff', what: 'Ingested via spreadsheet upload' }],
      });
    });
    return { success: true, importedCount: rows.length };
  }

  const now = new Date().toISOString();
  let importedCount = 0;

  // Determine the starting ID by reading the current max numeric suffix
  const { data: existing } = await supabase.from('referrals').select('id');
  const maxId = (existing ?? []).reduce((max, r: { id: string }) => {
    const n = parseInt(r.id.replace('REF-', ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 1042);

  for (const row of rows) {
    const referralId = `REF-${maxId + importedCount + 1}`;
    const dobIso = row.dateOfBirth
      ? (() => { const [m, d, y] = row.dateOfBirth!.split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; })()
      : null;

    const { data: patient, error: pe } = await supabase
      .from('patients')
      .insert({
        name: row.patientName,
        phone: row.phone,
        language: row.language ?? 'English',
        insurance: row.insurance ?? '',
        sex: row.sex || 'M',
        date_of_birth: dobIso,
      })
      .select('id')
      .single();

    if (pe || !patient) {
      console.error('[ingestReferrals] patient insert error:', pe?.message);
      continue;
    }

    const { error: re } = await supabase.from('referrals').insert({
      id: referralId,
      patient_id: patient.id,
      reason: row.reason ?? '',
      referring_provider: row.referringProvider ?? '',
      referral_source: 'Uploaded batch',
      referral_time: now,
      location: row.location || 'Mission Bay',
      priority: row.priority ?? 'normal',
      state: 'Queued',
      updated_at: now,
    });

    if (re) {
      console.error('[ingestReferrals] referral insert error:', re.message);
      continue;
    }

    await supabase.from('audit_log').insert({
      referral_id: referralId,
      what: 'Ingested via spreadsheet upload',
    });

    importedCount++;
  }
  return { success: true, importedCount };
}

// ── Referral log ──────────────────────────────────────────────────────────────

export async function getReferralLog(): Promise<ReferralLogEntry[]> {
  const [attemptsRes, auditRes] = await Promise.all([
    supabase
      .from('call_attempts')
      .select('*, referrals(id, patients(name))')
      .order('attempted_at', { ascending: false }),
    supabase
      .from('audit_log')
      .select('*, referrals(id, patients(name))')
      .order('created_at', { ascending: false }),
  ]);

  // Compute per-referral attempt numbers from attempts ordered ascending
  const allAttempts = attemptsRes.data ?? [];
  const byReferral: Record<string, string[]> = {};
  for (const a of [...allAttempts].sort((x: any, y: any) =>
    new Date(x.attempted_at).getTime() - new Date(y.attempted_at).getTime()
  )) {
    (byReferral[a.referral_id] ??= []).push(a.id);
  }

  const entries: ReferralLogEntry[] = [];

  for (const a of allAttempts) {
    entries.push({
      referralId: a.referral_id,
      patient: (a as any).referrals?.patients?.name ?? '—',
      at: fmtDate(a.attempted_at),
      type: 'ai_call',
      who: 'AI agent',
      what: `${a.channel === 'voice' ? 'Voice' : 'SMS'} · ${a.outcome}`,
      detail: a.summary ?? undefined,
      channel: a.channel as Channel,
      outcome: a.outcome,
      duration: fmtDuration(a.duration_secs),
      disclosurePlayed: a.disclosure_played ?? false,
      escalated: a.outcome === 'Escalated',
      hasTranscript: Array.isArray(a.transcript) && a.transcript.length > 0,
      attempt: (byReferral[a.referral_id] ?? []).indexOf(a.id) + 1,
    });
  }

  for (const e of auditRes.data ?? []) {
    entries.push({
      referralId: e.referral_id,
      patient: (e as any).referrals?.patients?.name ?? '—',
      at: fmtDate(e.created_at),
      type: e.what.startsWith('State') ? 'system' : 'manual_update',
      who: e.user_id ? 'Staff' : 'System',
      what: e.what,
    });
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboardFunnel(): Promise<DashboardFunnelStep[]> {
  return [..._dashboardFunnel];
}

export async function getDashboardHealthSignals(): Promise<DashboardHealthSignals> {
  const { data } = await supabase.from('referrals').select('state');
  const escalated = (data ?? []).filter((r: any) => r.state === 'Escalated').length;
  return {
    status: 'normal' as const,
    disclosureRatePct: _analytics.compliance.aiDisclosureRate,
    quietHoursAdherencePct: _analytics.compliance.quietHourAdherence,
    avgTimeToFirstAttemptMin: _callActivity.avgTimeToFirstAttemptMin,
    escalationsTriggered: escalated,
    shadowCalendarFidelityPct: _analytics.shadowFidelity.currentPct,
    optOutsHonored: _analytics.compliance.optOutsHonored,
  };
}
