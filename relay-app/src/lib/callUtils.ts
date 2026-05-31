// Shared call execution utility — used by the auto-call queue runner.
// Mirrors the logic in referrals/[id]/page.tsx (persistCallResult + initiateCall)
// but without React state dependencies so it can run outside the detail page component.

import {
  addCallAttempt,
  updateReferralState,
  createCapturedSlot,
  getBookedSlotKeys,
  normalizeTime,
} from './data';
import type { Referral, ReferralState, CallOutcome, ElevenLabsCallResult } from './types';

// ── Pure helpers (duplicated from detail page to avoid cross-component import) ──

const OUTCOME_TO_STATE: Record<string, ReferralState> = {
  'No Answer':             'Attempted',
  'Voicemail Left':        'Attempted',
  'Call Back Requested':   'In Progress',
  'Identity Verified':     'In Progress',
  Interested:              'In Progress',
  'Appointment Accepted':  'Pending Confirmation',
  'Transferred to Staff':  'Pending Confirmation',
  'Declined Referral':     'In Progress',
  'Wrong Number':          'Escalated',
  'Language Barrier':      'Escalated',
  Disconnected:            'In Progress',
  Escalated:               'Escalated',
};

const MONTH_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_S   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_LONG: Record<string, number> = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
  jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
};

function formatDuration(secs?: number): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function extractDateFromText(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  const entries = (Object.entries(MONTH_LONG) as [string, number][])
    .sort((a, b) => b[0].length - a[0].length);
  let month = -1, matchEnd = -1;
  let bestPos = Infinity;
  for (const [name, idx] of entries) {
    const pos = lower.indexOf(name);
    if (pos !== -1 && pos < bestPos) { month = idx; matchEnd = pos + name.length; bestPos = pos; }
  }
  if (month === -1) return undefined;
  const after = text.slice(matchEnd, matchEnd + 25);
  const m = after.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
  if (!m) return undefined;
  const dayNum = parseInt(m[1], 10);
  if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) return undefined;
  const d = new Date(2026, month, dayNum);
  if (isNaN(d.getTime())) return undefined;
  return `${DAY_S[d.getDay()]} ${MONTH_S[d.getMonth()]} ${d.getDate()}`;
}

function extractConfirmedSlotFromTranscript(
  transcript: { role: string; message: string }[]
): { day?: string; time?: string } {
  for (const turn of [...transcript].reverse().filter(t => t.role === 'agent')) {
    const msg = turn.message;
    if (/confirmed\s+for|booked\s+for|scheduled\s+for|appointment.*for/i.test(msg)) {
      const day = extractDateFromText(msg);
      const timeMatch = msg.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b/);
      const time = timeMatch ? timeMatch[1].replace(/\s+/, ' ').toUpperCase() : undefined;
      if (day || time) return { day, time };
    }
  }
  return {};
}

function normalizeSlotDay(raw: string): string {
  if (!raw) return raw;
  if (/^[A-Za-z]{3} [A-Za-z]{3} \d{1,2}$/.test(raw)) return raw;
  const native = new Date(raw);
  if (!isNaN(native.getTime()))
    return `${DAY_S[native.getDay()]} ${MONTH_S[native.getMonth()]} ${native.getDate()}`;
  const lower = raw.toLowerCase();
  let month = -1;
  for (const [name, idx] of Object.entries(MONTH_LONG)) {
    if (lower.includes(name)) { month = idx; break; }
  }
  const dayMatch = raw.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
  const dayNum = dayMatch ? parseInt(dayMatch[1], 10) : NaN;
  if (month !== -1 && !isNaN(dayNum)) {
    const d = new Date(2026, month, dayNum);
    if (!isNaN(d.getTime()))
      return `${DAY_S[d.getDay()]} ${MONTH_S[d.getMonth()]} ${d.getDate()}`;
  }
  return raw;
}

function outcomeFromResult(result: ElevenLabsCallResult): CallOutcome {
  const s = result.analysis?.call_successful;
  const reason = result.metadata?.termination_reason ?? '';
  const dcr = result.analysis?.data_collection_results ?? {};
  const appointmentCaptured = !!(
    (dcr.appointment_date ?? dcr.appointment_day ?? dcr.date)?.value ||
    (dcr.appointment_time ?? dcr.time)?.value
  );
  if (appointmentCaptured || s === 'success') return 'Appointment Accepted';
  if (reason === 'voicemail') return 'Voicemail Left';
  if (reason === 'no_answer') return 'No Answer';
  // Any other termination defaults to Appointment Accepted → Pending Confirmation
  // so ambiguous calls never silently drop to Attempted.
  return 'Appointment Accepted';
}

const ALL_TIMES = ['9:00 AM', '10:30 AM', '2:00 PM', '4:00 PM'];

function buildUpcomingSlots(n: number, bookedKeys: Set<string> = new Set()) {
  const slots: { spoken_date: string; weekday: string; date: string; times: string[]; spoken_options: string[] }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  while (slots.length < n) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const weekday = cursor.toLocaleDateString('en-US', { weekday: 'long' });
      const monthDay = cursor.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const year = cursor.getFullYear();
      const day = cursor.getDate();
      const suffix = day === 1 || day === 21 || day === 31 ? 'st'
        : day === 2 || day === 22 ? 'nd'
        : day === 3 || day === 23 ? 'rd' : 'th';
      const spoken_date = `${weekday}, ${monthDay.replace(/\d+/, `${day}${suffix}`)}`;
      // "DDD Mon D" key format matches normalizeSlotDay output stored in DB
      const dayKey = `${DAY_S[cursor.getDay()]} ${MONTH_S[cursor.getMonth()]} ${cursor.getDate()}`;
      const times = ALL_TIMES.filter(t => !bookedKeys.has(`${dayKey}|${t}`));
      if (times.length > 0) {
        slots.push({ spoken_date, weekday, date: `${monthDay}, ${year}`, times, spoken_options: times.map(t => `${spoken_date} at ${t}`) });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CallProgress {
  phase: 'initiating' | 'calling' | 'polling' | 'saving' | 'done' | 'error';
  error?: string;
}

export interface CallResult {
  outcome: CallOutcome;
  newState: ReferralState;
}

/**
 * Initiates, polls, and saves a single AI voice call for the given referral.
 * Designed to run outside of a React component (no React state).
 * onProgress fires at each phase transition so the queue runner can update UI.
 */
export async function runAndSaveCall(
  referral: Referral,
  onProgress?: (p: CallProgress) => void,
  abortSignal?: { aborted: boolean },
): Promise<CallResult> {
  const report = (p: CallProgress) => onProgress?.(p);

  // 1. Initiate the call
  report({ phase: 'initiating' });
  const [firstName, ...rest] = referral.patient.name.split(' ');
  const lastName = rest.join(' ');
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const bookedKeys = await getBookedSlotKeys();
  const upcomingSlots = buildUpcomingSlots(6, bookedKeys);
  const available_slots_summary = upcomingSlots.map(s => `${s.spoken_date}: ${s.times.join(', ')}`).join(' | ');
  const available_slots_json = JSON.stringify(upcomingSlots);

  const isSpanish = referral.patient.language?.toLowerCase().includes('spanish');

  const conversationConfigOverride = isSpanish ? {
    agent: { language: 'es' },
  } : undefined;

  const initRes = await fetch('/api/calls/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toNumber: referral.patient.phone,
      referralId: referral.id,
      dynamicVariables: {
        referral_id: referral.id,
        patient_name: referral.patient.name,
        patient_first_name: firstName,
        patient_last_name: lastName,
        patient_date_of_birth: referral.patient.dateOfBirth,
        patient_date_of_birth_digits: referral.patient.dateOfBirth.replace(/\D/g, ''),
        patient_preferred_language: referral.patient.language,
        patient_phone: referral.patient.phone,
        specialty: referral.reason,
        referring_provider: referral.referringProvider,
        referral_reason: referral.reason,
        preferred_location: referral.location,
        practice_name: 'Bay Cardiology',
        practice_phone_number: '919-465-3178',
        today_date: todayDate,
        available_slots_summary,
        available_slots_json,
        date_format_instruction: "When mentioning any appointment date or time, always say the full day of the week and the date together — for example 'Tuesday, June 11th at 4:00 PM'.",
        agent_name: 'Sarah',
      },
      ...(conversationConfigOverride ? { conversationConfigOverride } : {}),
    }),
  });

  const initData = await initRes.json();
  if (!initRes.ok) {
    const err = typeof initData.error === 'string' ? initData.error : 'Call initiation failed';
    report({ phase: 'error', error: err });
    throw new Error(err);
  }

  const callId: string = initData.callId;
  if (!callId) {
    report({ phase: 'error', error: 'No call ID returned' });
    throw new Error('No call ID returned from ElevenLabs');
  }

  // 2. Poll until done
  report({ phase: 'polling' });
  let pollCount = 0;
  let callResult: ElevenLabsCallResult | null = null;
  let transcriptRetry = 0;

  while (pollCount < 100) {
    if (abortSignal?.aborted) throw new Error('Aborted');
    await delay(3000);
    pollCount++;
    try {
      const pollRes = await fetch(`/api/calls/${callId}`);
      if (!pollRes.ok) continue;
      const data: ElevenLabsCallResult = await pollRes.json();
      if (data.status === 'done' || data.status === 'failed') {
        if (data.status === 'done' && (!data.transcript || data.transcript.length === 0) && transcriptRetry < 4) {
          transcriptRetry++;
          continue;
        }
        callResult = data;
        break;
      }
    } catch {
      // retry
    }
  }

  if (!callResult) {
    callResult = { conversation_id: callId, status: 'failed' };
  }

  // 3. Save the result
  report({ phase: 'saving' });
  const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const summary = callResult.analysis?.transcript_summary ?? 'AI call · no summary available';
  const outcome = outcomeFromResult(callResult);
  const baseState = OUTCOME_TO_STATE[outcome] ?? 'In Progress';
  const newState: ReferralState = baseState === 'In Progress' && referral.attempts.length > 0 ? 'In Progress' : baseState;
  const turns = (callResult.transcript ?? []).map(t => ({
    who: (t.role === 'agent' ? 'ai' : 'patient') as 'ai' | 'patient',
    text: t.message,
  }));

  const dcr = callResult.analysis?.data_collection_results ?? {};
  const fromTranscript = outcome === 'Appointment Accepted'
    ? extractConfirmedSlotFromTranscript(callResult.transcript ?? [])
    : {};
  const rawDay = outcome === 'Appointment Accepted'
    ? String((dcr.appointment_date ?? dcr.appointment_day ?? dcr.date)?.value ?? '')
    : '';
  const slotDay = fromTranscript.day
    ?? (outcome === 'Appointment Accepted' ? extractDateFromText(summary) : undefined)
    ?? (rawDay ? normalizeSlotDay(rawDay) : undefined);

  const saves: Promise<unknown>[] = [
    addCallAttempt(referral.id, {
      timestamp: now,
      channel: 'voice',
      outcome,
      duration: formatDuration(callResult.metadata?.call_duration_secs),
      disclosurePlayed: true,
      summary,
      transcript: turns,
      ...(slotDay ? { slotDay } : {}),
    }),
    updateReferralState(referral.id, newState),
  ];

  if (outcome === 'Appointment Accepted') {
    const day = slotDay ?? 'To be confirmed';
    const rawTime = String((dcr.appointment_time ?? dcr.time)?.value ?? '');
    const summaryTimeMatch = summary.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)|(?:\d{1,2})\s*(?:AM|PM))\b/i);
    const summaryTime = summaryTimeMatch ? summaryTimeMatch[1].replace(/\s+/, ' ').toUpperCase() : undefined;
    const rawTimeValue = fromTranscript.time ?? summaryTime ?? (rawTime || 'TBD');
    const time = rawTimeValue === 'TBD' ? 'TBD' : normalizeTime(rawTimeValue);
    const provider = String((dcr.provider ?? dcr.doctor ?? dcr.physician)?.value ?? referral.referringProvider ?? 'TBD');
    saves.push(createCapturedSlot(referral.id, { day, time, provider }));
  }

  await Promise.all(saves);
  report({ phase: 'done' });
  return { outcome, newState };
}
