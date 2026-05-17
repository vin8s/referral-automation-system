// Relay data accessor layer — the phase-2 swap point.
// Every screen calls these async functions. Mock data resolves immediately today.
// In phase 2, swap the internals for real API calls; component code stays unchanged.

import {
  referrals as _referrals,
  org as _org,
  currentUser as _currentUser,
  analytics as _analytics,
  dashboardCallActivity as _callActivity,
  dashboardFunnel as _dashboardFunnel,
  settingsDefaults as _settings,
} from './mockData';
import type {
  Referral, ReferralState, Attempt, ConfirmQueueItem, UrgentAlert,
  CallLogEntry, CalendarEvent, PipelineCount, Analytics,
  Org, CurrentUser, DashboardFunnelStep, DashboardHealthSignals,
} from './types';

// Internal mutable state for prototype interactions (confirm, reject, etc.)
let _state = _referrals.map(r => ({ ...r }));

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

// ── Org / session ──────────────────────────────────────────────────────────

export async function getOrg(): Promise<Org> {
  return delay(_org);
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return delay(_currentUser);
}

// ── Referrals ──────────────────────────────────────────────────────────────

export async function getReferrals(): Promise<Referral[]> {
  return delay([..._state]);
}

export async function getReferralById(id: string): Promise<Referral | null> {
  return delay(_state.find(r => r.id === id) ?? null);
}

export async function getReferralsInMotion(): Promise<Referral[]> {
  return delay([..._state]);
}

// ── Confirm queue (MA action queue) ──────────────────────────────────────

export async function getConfirmQueue(): Promise<ConfirmQueueItem[]> {
  const items = _state
    .filter(r => r.state === 'Pending Confirmation' && r.capturedSlot)
    .map(r => ({
      referralId: r.id,
      patient: r.patient.name,
      age: r.patient.age,
      sex: r.patient.sex,
      reason: r.reason,
      referringProvider: r.referringProvider,
      language: r.patient.language,
      insurance: r.patient.insurance,
      slot: r.capturedSlot!,
      capturedAgoMin: r.capturedSlot!.capturedAgoMin,
      priority: r.priority,
      summary: r.attempts[r.attempts.length - 1]?.summary ?? '',
      transcript: r.attempts[r.attempts.length - 1]?.transcript ?? [],
    }));
  return delay(items);
}

export async function confirmSlot(referralId: string): Promise<{ success: boolean }> {
  _state = _state.map(r => {
    if (r.id !== referralId) return r;
    return {
      ...r,
      state: 'Booked' as ReferralState,
      bookedAppointment: r.capturedSlot
        ? { ...r.capturedSlot, confirmedBy: _currentUser.fullName, confirmedAt: 'just now', mirrorStatus: 'mirrored' as const }
        : r.bookedAppointment,
      audit: [...r.audit, { at: 'just now', who: _currentUser.fullName, what: 'Confirmed in practice system (prototype)' }],
    };
  });
  return delay({ success: true });
}

export async function rejectSlot(referralId: string): Promise<{ success: boolean }> {
  _state = _state.map(r => {
    if (r.id !== referralId) return r;
    return {
      ...r,
      state: 'In Progress' as ReferralState,
      capturedSlot: null,
      audit: [...r.audit, { at: 'just now', who: _currentUser.fullName, what: 'Slot rejected — re-entering outreach (prototype)' }],
    };
  });
  return delay({ success: true });
}

// ── Urgent alerts ──────────────────────────────────────────────────────────

export async function getUrgentAlerts(): Promise<UrgentAlert[]> {
  const alerts = _state
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
  return delay(alerts);
}

export async function claimAlert(referralId: string, ownerName: string): Promise<{ success: boolean }> {
  _state = _state.map(r => {
    if (r.id !== referralId || !r.escalation) return r;
    return { ...r, escalation: { ...r.escalation, owner: ownerName } };
  });
  return delay({ success: true });
}

// ── AI call log ────────────────────────────────────────────────────────────

export async function getCallLog(): Promise<CallLogEntry[]> {
  const entries: CallLogEntry[] = _state.flatMap(r =>
    r.attempts.map(a => ({
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
    }))
  );
  return delay(entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)));
}

// ── Calendar ───────────────────────────────────────────────────────────────

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const events = _state
    .filter(r => r.bookedAppointment && r.state === 'Booked')
    .map(r => ({
      referralId: r.id,
      patient: r.patient.name,
      day: r.bookedAppointment!.day,
      time: r.bookedAppointment!.time,
      provider: r.bookedAppointment!.provider,
      state: r.state,
      mirrorStatus: r.bookedAppointment!.mirrorStatus,
    }));
  return delay(events);
}

// ── Pipeline / analytics ───────────────────────────────────────────────────

export async function getPipeline(): Promise<PipelineCount[]> {
  const states: ReferralState[] = ['Queued','In Progress','Pending Confirmation','Booked','Escalated'];
  return delay(states.map(s => ({ state: s, count: _state.filter(r => r.state === s).length })));
}

export async function getAnalytics(): Promise<Analytics> {
  return delay(_analytics);
}

export async function getDashboardCallActivity() {
  return delay(_callActivity);
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function getSettings() {
  return delay(_settings);
}

// ── Sidebar counts (live) ─────────────────────────────────────────────────

export async function getSidebarCounts(): Promise<{ urgentAlerts: number; confirmQueue: number; referrals: number }> {
  return delay({
    urgentAlerts: _state.filter(r => r.state === 'Escalated').length,
    confirmQueue: _state.filter(r => r.state === 'Pending Confirmation').length,
    referrals: _state.length,
  });
}

export async function updateReferralState(
  referralId: string,
  newState: ReferralState,
): Promise<{ success: boolean }> {
  const now = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  _state = _state.map(r => {
    if (r.id !== referralId) return r;
    return {
      ...r,
      state: newState,
      audit: [...r.audit, { at: now, who: _currentUser.fullName, what: `State manually updated to ${newState}` }],
    };
  });
  return delay({ success: true });
}

export async function addCallAttempt(
  referralId: string,
  attempt: Omit<Attempt, 'n'>,
): Promise<{ success: boolean }> {
  _state = _state.map(r => {
    if (r.id !== referralId) return r;
    const n = r.attempts.length + 1;
    return {
      ...r,
      attempts: [...r.attempts, { ...attempt, n }],
      audit: [...r.audit, {
        at: attempt.timestamp,
        who: 'Manual call',
        what: `Voice call: ${attempt.outcome} · ${attempt.duration}`,
      }],
    };
  });
  return delay({ success: true });
}

export async function getDashboardFunnel(): Promise<DashboardFunnelStep[]> {
  return delay([..._dashboardFunnel]);
}

export async function getDashboardHealthSignals(): Promise<DashboardHealthSignals> {
  return delay({
    status: 'normal' as const,
    disclosureRatePct: _analytics.compliance.aiDisclosureRate,
    quietHoursAdherencePct: _analytics.compliance.quietHourAdherence,
    avgTimeToFirstAttemptMin: _callActivity.avgTimeToFirstAttemptMin,
    escalationsTriggered: _state.filter(r => r.state === 'Escalated').length,
    shadowCalendarFidelityPct: _analytics.shadowFidelity.currentPct,
    optOutsHonored: _analytics.compliance.optOutsHonored,
  });
}
