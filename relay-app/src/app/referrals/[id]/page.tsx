"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getReferralById,
  addCallAttempt,
  updateReferralState,
  updateReferral,
  createCapturedSlot,
  patchLatestTranscript,
  getBookedSlotKeys,
} from "@/lib/data";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { StatePill } from "@/components/shared/StatePill";
import { StatePicker } from "@/components/shared/StatePicker";
import { Avatar } from "@/components/shared/Avatar";
import { Icon } from "@/components/shared/Icon";
import { TranscriptPanel } from "@/components/shared/TranscriptPanel";
import type {
  Referral,
  ReferralState,
  Attempt,
  ElevenLabsCallResult,
} from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span
        style={{
          width: 140,
          flexShrink: 0,
          fontSize: 12,
          color: "var(--relay-ink-3)",
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--relay-ink-2)", fontSize: 13 }}>{value}</span>
    </div>
  );
}

function EditField({
  label,
  field,
  draft,
  setDraft,
}: {
  label: string;
  field: string;
  draft: Record<string, string>;
  setDraft: (d: Record<string, string>) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        style={{
          width: 140,
          flexShrink: 0,
          fontSize: 12,
          color: "var(--relay-ink-3)",
        }}
      >
        {label}
      </span>
      <input
        value={draft[field] ?? ""}
        onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
        style={{
          flex: 1,
          fontSize: 13,
          padding: "4px 8px",
          border: "1px solid var(--relay-hairline)",
          borderRadius: 6,
          background: "var(--relay-surface)",
          color: "var(--relay-ink)",
          fontFamily: "inherit",
          outline: "none",
        }}
      />
    </div>
  );
}

function outcomeLabel(result: ElevenLabsCallResult): Attempt["outcome"] {
  const s = result.analysis?.call_successful;
  const reason = result.metadata?.termination_reason ?? "";
  const dcr = result.analysis?.data_collection_results ?? {};

  // If an appointment date or time was captured, the patient accepted — regardless
  // of how ElevenLabs scored call_successful (e.g. follow-up questions at end of call
  // can cause ElevenLabs to mark the call as failure/unknown even when booked).
  const appointmentCaptured = !!(
    (dcr.appointment_date ?? dcr.appointment_day ?? dcr.date)?.value ||
    (dcr.appointment_time ?? dcr.time)?.value
  );
  if (appointmentCaptured || s === "success") return "Appointment Accepted";

  if (reason === "agent_ended_call" || reason === "user_ended_call")
    return "Booked";
  if (reason === "voicemail") return "Voicemail Left";
  if (reason === "no_answer") return "No Answer";
  return "No Answer";
}

// Maps each call outcome to the resulting referral state per REFERRAL_STATUSES.md
const OUTCOME_TO_STATE: Record<string, ReferralState> = {
  "No Answer": "Attempted",
  "Voicemail Left": "Attempted",
  "Call Back Requested": "In Progress",
  "Identity Verified": "In Progress",
  Interested: "In Progress",
  "Appointment Accepted": "Pending Confirmation",
  Booked: "Booked",
  "Transferred to Staff": "Pending Confirmation",
  "Declined Referral": "In Progress",
  "Wrong Number": "Escalated",
  "Language Barrier": "Escalated",
  Disconnected: "In Progress",
  Escalated: "Escalated",
};

function formatDuration(secs?: number): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const MONTH_S = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_S   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_LONG: Record<string, number> = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
  jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
};

// Scan free-form text (e.g. transcript_summary) for the first recognizable date.
// Returns "Mon Jun 8" format, or undefined if nothing found.
function extractDateFromText(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  // Sort month names longest-first so "march" wins over "mar"
  const entries = (Object.entries(MONTH_LONG) as [string, number][])
    .sort((a, b) => b[0].length - a[0].length);
  let month = -1;
  let matchEnd = -1;
  let bestPos = Infinity;
  for (const [name, idx] of entries) {
    const pos = lower.indexOf(name);
    // Take the earliest occurrence; if tied on position, longer name wins (entries are sorted longest-first)
    if (pos !== -1 && pos < bestPos) {
      month = idx;
      matchEnd = pos + name.length;
      bestPos = pos;
    }
  }
  if (month === -1) return undefined;
  // Look for a day number in the ~25 chars after the month name
  const after = text.slice(matchEnd, matchEnd + 25);
  const m = after.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
  if (!m) return undefined;
  const dayNum = parseInt(m[1], 10);
  if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) return undefined;
  const d = new Date(2026, month, dayNum);
  if (isNaN(d.getTime())) return undefined;
  return `${DAY_S[d.getDay()]} ${MONTH_S[d.getMonth()]} ${d.getDate()}`;
}

// Scan agent turns (latest-first) for the booking confirmation statement and
// extract the confirmed date and time. The agent always says something like
// "Your appointment is confirmed for Tuesday, June 2nd at 4:00 PM" — this is
// more reliable than data_collection_results, which tends to pick the first
// date mentioned rather than the patient-confirmed one.
function extractConfirmedSlotFromTranscript(
  transcript: { role: string; message: string }[]
): { day?: string; time?: string } {
  const agentTurns = [...transcript].reverse().filter(t => t.role === "agent");
  for (const turn of agentTurns) {
    const msg = turn.message;
    if (/confirmed\s+for|booked\s+for|scheduled\s+for|appointment.*for/i.test(msg)) {
      const day = extractDateFromText(msg);
      const timeMatch = msg.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b/);
      const time = timeMatch ? timeMatch[1].replace(/\s+/, " ").toUpperCase() : undefined;
      if (day || time) return { day, time };
    }
  }
  return {};
}

// Convert any date string ElevenLabs might return to "Mon Jun 8" calendar format.
function normalizeSlotDay(raw: string): string {
  if (!raw) return raw;
  // Already correct format "Mon Jun 8"
  if (/^[A-Za-z]{3} [A-Za-z]{3} \d{1,2}$/.test(raw)) return raw;

  // Try native parsing first ("June 8, 2026", "2026-06-08", etc.)
  const native = new Date(raw);
  if (!isNaN(native.getTime())) {
    return `${DAY_S[native.getDay()]} ${MONTH_S[native.getMonth()]} ${native.getDate()}`;
  }

  // Fallback: extract month name + day number from natural language
  // e.g. "Monday, June 8th" | "Monday June 8" | "June 8th"
  const lower = raw.toLowerCase();
  let month = -1;
  for (const [name, idx] of Object.entries(MONTH_LONG)) {
    if (lower.includes(name)) { month = idx; break; }
  }
  const dayMatch = raw.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
  const dayNum = dayMatch ? parseInt(dayMatch[1], 10) : NaN;

  if (month !== -1 && !isNaN(dayNum)) {
    // Appointments are always in the future relative to the prototype anchor (2026)
    const d = new Date(2026, month, dayNum);
    if (!isNaN(d.getTime())) {
      return `${DAY_S[d.getDay()]} ${MONTH_S[d.getMonth()]} ${d.getDate()}`;
    }
  }

  return raw; // give up — calendar will filter it out
}

// Returns n upcoming weekday slots with pre-formatted spoken labels so the agent
// mirrors the exact format ("Tuesday, June 11th at 4:00 PM") when reading them aloud.
const ALL_SLOT_TIMES = ["9:00 AM", "10:30 AM", "2:00 PM", "4:00 PM"];
const MONTH_S_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_S_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function buildUpcomingSlots(n: number, bookedKeys: Set<string> = new Set()) {
  const slots: { spoken_date: string; weekday: string; date: string; times: string[]; spoken_options: string[] }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  while (slots.length < n) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const weekday = cursor.toLocaleDateString("en-US", { weekday: "long" });
      const monthDay = cursor.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      const year = cursor.getFullYear();
      const day = cursor.getDate();
      const suffix = day === 1 || day === 21 || day === 31 ? "st"
        : day === 2 || day === 22 ? "nd"
        : day === 3 || day === 23 ? "rd" : "th";
      const spoken_date = `${weekday}, ${monthDay.replace(/\d+/, `${day}${suffix}`)}`;
      const dayKey = `${DAY_S_SHORT[cursor.getDay()]} ${MONTH_S_SHORT[cursor.getMonth()]} ${cursor.getDate()}`;
      const times = ALL_SLOT_TIMES.filter(t => !bookedKeys.has(`${dayKey}|${t}`));
      if (times.length > 0) {
        slots.push({
          spoken_date,
          weekday,
          date: `${monthDay}, ${year}`,
          times,
          spoken_options: times.map((t) => `${spoken_date} at ${t}`),
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}

// ── Call confirmation modal ───────────────────────────────────────────────────

function CallConfirmModal({
  patientName,
  phone,
  onConfirm,
  onCancel,
}: {
  patientName: string;
  phone: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--relay-surface)",
          borderRadius: 12,
          padding: 28,
          width: 380,
          boxShadow: "var(--relay-shadow-pop)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 99,
              background: "var(--st-outreach-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name="phone"
              size={16}
              style={{ color: "var(--st-outreach-fg)" }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              Initiate AI call
            </div>
            <div style={{ fontSize: 12, color: "var(--relay-ink-3)" }}>
              ElevenLabs voice agent
            </div>
          </div>
        </div>

        <div
          style={{
            background: "var(--relay-tint)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          <div>
            <span style={{ color: "var(--relay-ink-3)" }}>Patient: </span>
            <strong>{patientName}</strong>
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={{ color: "var(--relay-ink-3)" }}>Phone: </span>
            <strong>{phone}</strong>
          </div>
        </div>

        <p
          style={{
            fontSize: 12.5,
            color: "var(--relay-ink-3)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          The AI agent will call the patient now using the Relay voice system.
          The call will be recorded and the transcript saved to this
          referral&apos;s timeline.
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-sm btn-primary" onClick={onConfirm}>
            <Icon name="phone" size={12} /> Call now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Post-call result panel ────────────────────────────────────────────────────

function CallResultPanel({
  result,
  saving,
  determinedState,
}: {
  result: ElevenLabsCallResult;
  saving: boolean;
  determinedState: ReferralState;
}) {
  const duration = formatDuration(result.metadata?.call_duration_secs);
  const summary = result.analysis?.transcript_summary ?? "—";
  const connected = result.analysis?.call_successful !== "failure";

  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--relay-accent-200)",
        background: "var(--relay-accent-50)",
      }}
    >
      <div className="card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 99,
              background: connected
                ? "var(--st-booked-bg)"
                : "var(--relay-tint)",
              color: connected ? "var(--st-booked-fg)" : "var(--relay-ink-3)",
              fontSize: 11,
            }}
          >
            <Icon name={connected ? "check" : "x"} size={11} />
          </span>
          <h3 style={{ margin: 0 }}>
            Call complete · {connected ? "Connected" : "No answer"} · {duration}
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatePill state={determinedState} />
          {saving && (
            <span style={{ fontSize: 12, color: "var(--relay-ink-3)" }}>
              Saving to timeline…
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--relay-ink-4)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          AI Summary
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--relay-ink-2)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {summary}
        </p>
      </div>

      {result.transcript && result.transcript.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 10.5,
              color: "var(--relay-ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Transcript
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {result.transcript.map((turn, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  flexDirection: turn.role === "agent" ? "row" : "row-reverse",
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    flexShrink: 0,
                    marginTop: 2,
                    color:
                      turn.role === "agent"
                        ? "var(--relay-accent)"
                        : "var(--relay-ink-3)",
                  }}
                >
                  {turn.role === "agent" ? "AI" : "PT"}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    padding: "6px 10px",
                    borderRadius: 8,
                    background:
                      turn.role === "agent" ? "var(--relay-tint)" : "white",
                    border: "1px solid var(--relay-hairline)",
                    maxWidth: "80%",
                  }}
                >
                  {turn.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type CallPhase =
  | "idle"
  | "confirming"
  | "calling"
  | "polling"
  | "done"
  | "error";

export default function ReferralDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [referral, setReferral] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(true);

  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [callResult, setCallResult] = useState<ElevenLabsCallResult | null>(
    null,
  );
  const [callError, setCallError] = useState<string | null>(null);
  const [savingCall, setSavingCall] = useState(false);
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editComment, setEditComment] = useState("");
  const [saving, setSaving] = useState(false);

  const { setActiveCall } = useActiveCall();
  const setActiveCallRef = useRef(setActiveCall);
  useEffect(() => { setActiveCallRef.current = setActiveCall; }, [setActiveCall]);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  const transcriptRetryRef = useRef(0);
  const isMountedRef = useRef(true);
  const referralRef = useRef<Referral | null>(null);

  const loadReferral = useCallback(async () => {
    const r = await getReferralById(id);
    setReferral(r);
    referralRef.current = r;
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadReferral();
  }, [loadReferral]);

  // Keep referralRef in sync so background poll can access it after unmount
  useEffect(() => {
    referralRef.current = referral;
  }, [referral]);

  // Mark unmounted — do NOT cancel the poll so background saves still complete
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  function handleStateChange(_referralId: string, next: ReferralState) {
    setReferral((prev) => (prev ? { ...prev, state: next } : prev));
  }

  // ── Edit flow ───────────────────────────────────────────────────────────────

  function enterEdit() {
    if (!referral) return;
    const r = referral;
    setEditDraft({
      patientName: r.patient.name,
      dateOfBirth: r.patient.dateOfBirth,
      phone: r.patient.phone,
      language: r.patient.language,
      insurance: r.patient.insurance,
      reason: r.reason,
      referringProvider: r.referringProvider,
      priority: r.priority,
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!referral) return;
    setSaving(true);
    await updateReferral(referral.id, editDraft, editComment || undefined);
    setSaving(false);
    setEditing(false);
    setEditComment("");
    await loadReferral();
  }

  // ── Call flow ───────────────────────────────────────────────────────────────

  function startCall() {
    setCallPhase("confirming");
  }
  function cancelConfirm() {
    setCallPhase("idle");
  }

  async function initiateCall() {
    if (!referral) return;
    pollCountRef.current = 0;
    setCallPhase("calling");
    setCallError(null);
    try {
      const [firstName, ...rest] = referral.patient.name.split(" ");
      const lastName = rest.join(" ");

      // Build current date and upcoming slot options with accurate day-of-week labels
      const todayDate = new Date().toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      const bookedKeys = await getBookedSlotKeys();
      const upcomingSlots = buildUpcomingSlots(6, bookedKeys);
      // Summary uses the pre-formatted spoken style so the agent reads dates the same way
      const available_slots_summary = upcomingSlots
        .map((s) => `${s.spoken_date}: ${s.times.join(", ")}`)
        .join(" | ");
      const available_slots_json = JSON.stringify(upcomingSlots);
      const date_format_instruction =
        "When mentioning any appointment date or time, always say the full day of the week and the date together — for example 'Tuesday, June 11th at 4:00 PM', never just 'June 11th at 4 PM' or 'Tuesday at 4 PM'.";

      const res = await fetch("/api/calls/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toNumber: referral.patient.phone,
          referralId: referral.id,
          dynamicVariables: {
            referral_id: referral.id,
            patient_name: referral.patient.name,
            patient_first_name: firstName,
            patient_last_name: lastName,
            patient_date_of_birth: referral.patient.dateOfBirth,
            patient_date_of_birth_digits: referral.patient.dateOfBirth.replace(
              /\D/g,
              "",
            ),
            patient_preferred_language: referral.patient.language,
            patient_phone: referral.patient.phone,
            specialty: referral.reason,
            referring_provider: referral.referringProvider,
            referral_reason: referral.reason,
            preferred_location: referral.location,
            practice_name: "Bay Cardiology",
            practice_phone_number: "",
            today_date: todayDate,
            available_slots_summary,
            available_slots_json,
            date_format_instruction,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errVal = data.error;
        setCallError(
          typeof errVal === "string"
            ? errVal
            : errVal != null
              ? JSON.stringify(errVal)
              : "Call initiation failed",
        );
        setCallPhase("error");
        return;
      }
      if (data.callId) {
        setCallId(data.callId);
        setCallPhase("polling");
        transcriptRetryRef.current = 0;
        if (referral) {
          setActiveCallRef.current({ callId: data.callId, referralId: referral.id, patientName: referral.patient.name });
        }
        schedulePoll(data.callId);
      } else {
        setCallError("No call ID returned from ElevenLabs");
        setCallPhase("error");
      }
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Network error");
      setCallPhase("error");
    }
  }

  function schedulePoll(cid: string) {
    pollRef.current = setTimeout(() => poll(cid), 3000);
  }

  async function poll(cid: string) {
    pollCountRef.current += 1;
    // Give up after ~5 minutes (100 polls × 3s)
    if (pollCountRef.current > 100) {
      if (isMountedRef.current) setCallPhase("done");
      return;
    }
    try {
      const res = await fetch(`/api/calls/${cid}`);
      if (!res.ok) {
        schedulePoll(cid);
        return;
      }
      const data: ElevenLabsCallResult = await res.json();
      if (data.status === "done" || data.status === "failed") {
        // Retry up to 5× if status is done but transcript hasn't populated yet
        if (
          data.status === "done" &&
          (!data.transcript || data.transcript.length === 0) &&
          transcriptRetryRef.current < 15
        ) {
          transcriptRetryRef.current += 1;
          schedulePoll(cid);
          return;
        }
        if (isMountedRef.current) {
          setCallResult(data);
          setCallPhase("done");
        } else {
          // Component unmounted — save directly without React state
          const ref = referralRef.current;
          if (ref) persistCallResult(data, ref);
        }
      } else {
        schedulePoll(cid);
      }
    } catch {
      schedulePoll(cid);
    }
  }

  function buildTurns(result: ElevenLabsCallResult) {
    return (result.transcript ?? []).map((t) => ({
      who: (t.role === "agent" ? "ai" : "patient") as "ai" | "patient",
      text: t.message,
    }));
  }

  // Core save logic — no React state, safe to call after unmount. Returns the turns that were saved.
  async function persistCallResult(
    result: ElevenLabsCallResult,
    currentReferral: Referral,
  ): Promise<{ who: "ai" | "patient"; text: string }[]> {
    const now = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const duration = formatDuration(result.metadata?.call_duration_secs);
    const summary = result.analysis?.transcript_summary ?? "AI call · no summary available";
    const outcome = outcomeLabel(result);
    const baseState = OUTCOME_TO_STATE[outcome] ?? "In Progress";
    // Promote "In Progress" → "Attempted" once there are prior call attempts
    const newState: ReferralState = baseState === "In Progress" && currentReferral.attempts.length > 0
      ? "Attempted"
      : baseState;
    const turns = buildTurns(result);
    const dcr = result.analysis?.data_collection_results ?? {};

    // Primary: extract from the agent's final confirmation statement in the
    // transcript ("Your appointment is confirmed for Monday, June 1st at 2:00 PM").
    // This is more reliable than data_collection, which frequently picks the
    // first date offered rather than the one the patient actually confirmed.
    const fromTranscript = outcome === "Appointment Accepted"
      ? extractConfirmedSlotFromTranscript(result.transcript ?? [])
      : {};

    // Secondary: free-text extraction from the AI-generated summary (more reliable than DCR,
    // which frequently captures the first date offered rather than the one the patient confirmed).
    // Tertiary: data_collection_results as last resort.
    const rawDay = outcome === "Appointment Accepted"
      ? String((dcr.appointment_date ?? dcr.appointment_day ?? dcr.date)?.value ?? "")
      : "";
    const slotDay = fromTranscript.day
      ?? (outcome === "Appointment Accepted" ? extractDateFromText(summary) : undefined)
      ?? (rawDay ? normalizeSlotDay(rawDay) : undefined);

    const saves: Promise<unknown>[] = [
      addCallAttempt(currentReferral.id, {
        timestamp: now,
        channel: "voice" as const,
        outcome,
        duration,
        disclosurePlayed: true,
        summary,
        transcript: turns,
        ...(slotDay ? { slotDay } : {}),
      }),
      updateReferralState(currentReferral.id, newState),
    ];

    if (outcome === "Appointment Accepted") {
      const day      = slotDay ?? "To be confirmed";
      const rawTime  = String((dcr.appointment_time ?? dcr.time)?.value ?? "");
      const summaryTimeMatch = summary.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)|(?:\d{1,2})\s*(?:AM|PM))\b/i);
      const summaryTime = summaryTimeMatch
        ? summaryTimeMatch[1].replace(/\s+/, " ").toUpperCase()
        : undefined;
      const time = fromTranscript.time ?? summaryTime ?? (rawTime || "TBD");
      const provider = String((dcr.provider ?? dcr.doctor ?? dcr.physician)?.value ?? currentReferral.referringProvider ?? "TBD");
      saves.push(createCapturedSlot(currentReferral.id, { day, time, provider }));
    }

    await Promise.all(saves);
    setActiveCallRef.current(null);
    return turns;
  }

  // Patch the last attempt in local React state with a transcript that arrived late.
  function applyLateTranscript(turns: { who: "ai" | "patient"; text: string }[]) {
    setReferral((prev) => {
      if (!prev || !prev.attempts.length) return prev;
      const updated = [...prev.attempts];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = { ...last, transcript: turns };
      return { ...prev, attempts: updated };
    });
  }

  // If the transcript wasn't ready when we first saved, keep polling ElevenLabs and
  // patch state + Supabase as soon as it arrives (up to ~2 min).
  async function lateLoadTranscript(conversationId: string, referralId: string) {
    for (let i = 0; i < 8; i++) {
      await new Promise<void>((r) => setTimeout(r, 10_000));
      try {
        const res = await fetch(`/api/calls/${conversationId}`);
        if (!res.ok) continue;
        const data: ElevenLabsCallResult = await res.json();
        const turns = buildTurns(data);
        if (turns.length > 0) {
          if (isMountedRef.current) applyLateTranscript(turns);
          patchLatestTranscript(referralId, turns);
          break;
        }
      } catch {
        // continue
      }
    }
  }

  async function saveCallToTimeline(
    result: ElevenLabsCallResult,
    currentReferral: Referral,
  ) {
    setSavingCall(true);
    const turns = await persistCallResult(result, currentReferral);
    setSavingCall(false);
    setCallPhase("idle");
    setCallResult(null);
    setCallId(null);

    // Update local state directly from the call result — don't depend on a
    // Supabase round-trip, which can fail or race against stale data.
    const now = new Date().toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const outcome = outcomeLabel(result);
    const baseState = OUTCOME_TO_STATE[outcome] ?? "In Progress";
    const newState: ReferralState = baseState === "In Progress" && currentReferral.attempts.length > 0
      ? "Attempted"
      : baseState;
    const newAttempt: Attempt = {
      n: currentReferral.attempts.length + 1,
      timestamp: now,
      channel: "voice" as const,
      outcome,
      duration: formatDuration(result.metadata?.call_duration_secs),
      disclosurePlayed: true,
      summary: result.analysis?.transcript_summary ?? "AI call · no summary available",
      transcript: turns,
    };

    setReferral((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        state: newState,
        attempts: [...prev.attempts, newAttempt],
      };
    });

    // If ElevenLabs transcript wasn't ready yet, poll until it arrives
    if (turns.length === 0 && result.conversation_id) {
      lateLoadTranscript(result.conversation_id, currentReferral.id);
    }
  }

  // Auto-save immediately when a call result arrives — no manual button needed
  useEffect(() => {
    if (callPhase === "done" && callResult && referral) {
      saveCallToTimeline(callResult, referral);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callPhase, callResult]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--relay-ink-3)", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (!referral) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Referral not found
        </div>
        <Link href="/referrals">
          <button className="btn btn-sm">← Back to referrals</button>
        </Link>
      </div>
    );
  }

  const r = referral;
  const lastAttempt = r.attempts[r.attempts.length - 1];

  return (
    <>
      {/* Modals */}
      {callPhase === "confirming" && (
        <CallConfirmModal
          patientName={r.patient.name}
          phone={r.patient.phone}
          onConfirm={initiateCall}
          onCancel={cancelConfirm}
        />
      )}

      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Link href="/referrals">
          <button className="btn btn-sm btn-ghost">← Referrals</button>
        </Link>
        <span
          style={{
            fontSize: 12,
            color: "var(--relay-ink-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {r.id}
        </span>
      </div>

      {/* Page head */}
      <div
        className="pg-head"
        style={{ marginBottom: 22, alignItems: "flex-start" }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar name={r.patient.name} size="lg" />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <h1 style={{ fontSize: 22, margin: 0 }}>{r.patient.name}</h1>
            </div>
            <div
              className="sub"
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 6,
              }}
            >
              {r.patient.age}
              {r.patient.sex} · {r.patient.language} · {r.patient.insurance}
              <StatePicker
                referralId={r.id}
                current={r.state}
                onChange={handleStateChange}
              />
              {r.priority === "urgent" && (
                <span
                  style={{
                    fontSize: 11.5,
                    background: "#fee2e2",
                    color: "#b91c1c",
                    padding: "2px 8px",
                    borderRadius: 99,
                    fontWeight: 500,
                  }}
                >
                  Urgent
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="right">
          {/* Make call button */}
          {callPhase === "idle" && (
            <button className="btn btn-sm btn-primary" onClick={startCall}>
              <Icon name="phone" size={12} /> Make call
            </button>
          )}
          {callPhase === "calling" && (
            <button className="btn btn-sm" disabled>
              <Icon name="phone" size={12} /> Calling…
            </button>
          )}
          {callPhase === "polling" && (
            <button className="btn btn-sm" disabled>
              <Icon name="phone" size={12} /> Call in progress…
            </button>
          )}
          {callPhase === "done" && (
            <button
              className="btn btn-sm"
              style={{
                background: "var(--st-booked-bg)",
                color: "var(--st-booked-fg)",
                borderColor: "var(--relay-accent-200)",
              }}
              disabled
            >
              <Icon name="check" size={12} /> Call complete
            </button>
          )}
          {callPhase === "error" && (
            <button
              className="btn btn-sm"
              style={{
                background: "#fee2e2",
                color: "#b91c1c",
                borderColor: "#fecaca",
              }}
              onClick={startCall}
            >
              <Icon name="alert" size={12} /> Retry call
            </button>
          )}

          {/* Edit info buttons */}
          {!editing ? (
            <button className="btn btn-sm" onClick={enterEdit}>
              <Icon name="edit" size={12} /> Edit info
            </button>
          ) : (
            <>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={saveEdit}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}

          {r.state === "Pending Confirmation" && (
            <Link href="/action">
              <button className="btn btn-sm btn-primary">
                <Icon name="check" size={12} /> Confirm slot
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* Error banner */}
      {callPhase === "error" && callError && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fee2e2",
            color: "#b91c1c",
            fontSize: 13,
            border: "1px solid #fecaca",
          }}
        >
          <strong>Call failed:</strong> {callError}
        </div>
      )}

      {/* Polling status banner */}
      {callPhase === "polling" && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--st-outreach-bg)",
            color: "var(--st-outreach-fg)",
            fontSize: 13,
            border: "1px solid var(--relay-hairline)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 99,
              background: "var(--st-outreach-fg)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          AI voice call in progress · Polling for transcript… (call ID: {callId}
          )
        </div>
      )}

      {/* Post-call result panel — shown while auto-saving */}
      {(callPhase === "done" || savingCall) && callResult && (
        <div style={{ marginBottom: 20 }}>
          <CallResultPanel
            result={callResult}
            saving={savingCall}
            determinedState={
              OUTCOME_TO_STATE[outcomeLabel(callResult)] ?? "In Progress"
            }
          />
        </div>
      )}

      {/* Two-column layout */}
      <div className="row">
        {/* Left: patient facts + appointment cards + audit */}
        <div className="stack" style={{ flex: 1 }}>
          <div className="card">
            <h3>Patient &amp; insurance</h3>
            <div className="stack-tight" style={{ fontSize: 13, marginTop: 6 }}>
              {!editing ? (
                <>
                  <Fact label="Name" value={r.patient.name} />
                  <Fact label="Date of birth" value={r.patient.dateOfBirth} />
                  <Fact
                    label="Age / sex"
                    value={`${r.patient.age} · ${r.patient.sex === "F" ? "Female" : "Male"}`}
                  />
                  <Fact label="Phone" value={r.patient.phone} />
                  <Fact label="Preferred language" value={r.patient.language} />
                  <Fact label="Insurance" value={r.patient.insurance} />
                </>
              ) : (
                <>
                  <EditField
                    label="Name"
                    field="patientName"
                    draft={editDraft}
                    setDraft={setEditDraft}
                  />
                  <EditField
                    label="Date of birth"
                    field="dateOfBirth"
                    draft={editDraft}
                    setDraft={setEditDraft}
                  />
                  <EditField
                    label="Phone"
                    field="phone"
                    draft={editDraft}
                    setDraft={setEditDraft}
                  />
                  <EditField
                    label="Preferred language"
                    field="language"
                    draft={editDraft}
                    setDraft={setEditDraft}
                  />
                  <EditField
                    label="Insurance"
                    field="insurance"
                    draft={editDraft}
                    setDraft={setEditDraft}
                  />
                </>
              )}
            </div>
            <div className="relay-divider" />
            <h3>Referral facts</h3>
            <div className="stack-tight" style={{ fontSize: 13, marginTop: 6 }}>
              {!editing ? (
                <>
                  <Fact label="Reason" value={r.reason} />
                  <Fact
                    label="Referring provider"
                    value={r.referringProvider}
                  />
                  <Fact label="Received" value={r.referralTime} />
                  <Fact
                    label="Attempts"
                    value={`${r.attempts.length} (voice + SMS)`}
                  />
                </>
              ) : (
                <>
                  <EditField
                    label="Reason"
                    field="reason"
                    draft={editDraft}
                    setDraft={setEditDraft}
                  />
                  <EditField
                    label="Referring provider"
                    field="referringProvider"
                    draft={editDraft}
                    setDraft={setEditDraft}
                  />
                  <EditField
                    label="Priority"
                    field="priority"
                    draft={editDraft}
                    setDraft={setEditDraft}
                  />
                </>
              )}
            </div>
            {editing && (
              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--relay-ink-3)",
                    marginBottom: 4,
                  }}
                >
                  Comment (optional)
                </div>
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  placeholder="Reason for edit, additional context…"
                  rows={2}
                  style={{
                    width: "100%",
                    fontSize: 13,
                    padding: "6px 10px",
                    border: "1px solid var(--relay-hairline)",
                    borderRadius: 6,
                    background: "var(--relay-surface)",
                    color: "var(--relay-ink)",
                    fontFamily: "inherit",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--relay-ink-4)",
                    marginTop: 4,
                  }}
                >
                  (prototype — saved to referral audit trail)
                </div>
              </div>
            )}
          </div>

          {r.capturedSlot && (
            <div
              className="card"
              style={{
                background: "var(--relay-accent-50)",
                borderColor: "var(--relay-accent-200)",
              }}
            >
              <div
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                  color: "var(--relay-accent-700)",
                  fontSize: 11,
                }}
              >
                Captured slot — awaiting confirmation
              </div>
              <div className="fw-6" style={{ marginTop: 6, fontSize: 14 }}>
                <Icon name="cal" size={14} /> {r.capturedSlot.day} ·{" "}
                {r.capturedSlot.time} · {r.capturedSlot.provider}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "var(--relay-ink-3)",
                }}
              >
                Captured {r.capturedSlot.capturedAgoMin}m ago
              </div>
              <div style={{ marginTop: 10 }}>
                <Link href="/action">
                  <button className="btn btn-sm btn-primary">
                    <Icon name="check" size={12} /> Confirm in action queue
                  </button>
                </Link>
              </div>
            </div>
          )}

          {r.bookedAppointment && (
            <div
              className="card"
              style={{
                background: "var(--st-booked-bg)",
                borderColor: "var(--relay-accent-200)",
              }}
            >
              <div
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                  color: "var(--relay-accent-700)",
                  fontSize: 11,
                }}
              >
                Confirmed appointment
              </div>
              <div className="fw-6" style={{ marginTop: 6, fontSize: 14 }}>
                <Icon name="cal" size={14} /> {r.bookedAppointment.day} ·{" "}
                {r.bookedAppointment.time} · {r.bookedAppointment.provider}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "var(--relay-ink-3)",
                }}
              >
                Confirmed by {r.bookedAppointment.confirmedBy} ·{" "}
                {r.bookedAppointment.confirmedAt}
              </div>
            </div>
          )}
        </div>

        {/* Right: timeline + transcript */}
        <div className="stack" style={{ flex: 1.6 }}>
          <div className="card">
            <div className="card-head">
              <h3>Activity timeline</h3>
              <button className="btn btn-sm btn-ghost">
                Export <Icon name="download" size={11} />
              </button>
            </div>
            {r.attempts.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--relay-ink-3)",
                  padding: "12px 0",
                }}
              >
                No attempts yet. Use &quot;Make call&quot; to initiate the first
                outreach.
              </div>
            ) : (
              <div className="tl">
                {[...r.attempts].reverse().map((attempt, i, arr) => {
                  const isExpanded = expandedAttempt === attempt.n;
                  const hasTranscript =
                    attempt.channel === "voice" &&
                    attempt.transcript.length > 0;
                  const isLast = i === arr.length - 1;
                  const isDone =
                    attempt.outcome === "Appointment Accepted" ||
                    attempt.outcome === "Booked";
                  const isEscalated = attempt.outcome === "Escalated";
                  return (
                    <div className="tl-item" key={attempt.n}>
                      <div className="tl-marker">
                        <div
                          className={`tl-dot${isDone ? " done" : ""}`}
                          style={
                            isEscalated
                              ? {
                                  background: "var(--relay-urgent)",
                                  borderColor: "var(--relay-urgent)",
                                }
                              : undefined
                          }
                        />
                        {!isLast && <div className="tl-line" />}
                      </div>
                      <div className="tl-body">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: hasTranscript ? "pointer" : "default",
                          }}
                          onClick={() =>
                            hasTranscript &&
                            setExpandedAttempt(isExpanded ? null : attempt.n)
                          }
                        >
                          <div className="tl-title">
                            Attempt #{attempt.n} ·{" "}
                            {attempt.channel === "voice" ? "Voice" : "SMS"} ·{" "}
                            {attempt.outcome}
                            {attempt.outcome === "Appointment Accepted" &&
                              (() => {
                                const day =
                                  attempt.slotDay ??
                                  r.bookedAppointment?.day ??
                                  r.capturedSlot?.day;
                                return day ? ` — ${day}` : null;
                              })()}
                          </div>
                          {hasTranscript && (
                            <Icon
                              name="chevron"
                              size={11}
                              style={{
                                color: "var(--relay-ink-3)",
                                flexShrink: 0,
                                marginLeft: 8,
                                transform: isExpanded
                                  ? "rotate(180deg)"
                                  : "rotate(0deg)",
                                transition: "transform 150ms ease",
                              }}
                            />
                          )}
                        </div>
                        <div className="tl-meta">
                          {attempt.timestamp}
                          {attempt.duration &&
                            attempt.duration !== "—" &&
                            ` · ${attempt.duration}`}
                          {attempt.disclosurePlayed && " · disclosure played"}
                        </div>
                        {attempt.summary && (
                          <div
                            className="transcript-summary"
                            style={{ marginTop: 8, fontSize: 12.5 }}
                          >
                            {attempt.summary}
                          </div>
                        )}
                        {isExpanded && hasTranscript && (
                          <div
                            style={{
                              marginTop: 12,
                              borderTop: "1px solid var(--relay-hairline)",
                              paddingTop: 12,
                            }}
                          >
                            <TranscriptPanel
                              data={{
                                patient: r.patient.name,
                                call: `Attempt #${attempt.n} · Voice · ${attempt.duration ?? ""}`,
                                disclosure: attempt.disclosurePlayed,
                                summary: attempt.summary,
                                turns: attempt.transcript,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
