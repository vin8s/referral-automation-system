"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getReferralById, updateReferral } from "@/lib/data";
import { outcomeLabel } from "@/lib/format";
import { StatePicker } from "@/components/shared/StatePicker";
import { Avatar } from "@/components/shared/Avatar";
import { Icon } from "@/components/shared/Icon";
import { SmsConversationCard } from "@/components/shared/SmsConversationCard";
import type { Referral, ReferralState } from "@/lib/types";


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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReferralDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [referral, setReferral] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editComment, setEditComment] = useState("");
  const [saving, setSaving] = useState(false);

  const loadReferral = useCallback(async () => {
    const r = await getReferralById(id);
    setReferral(r);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadReferral();
  }, [loadReferral]);


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
      specialty: r.specialty ?? "",
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

  return (
    <>
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
                  <Fact label="Specialty" value={r.specialty || "—"} />
                  <Fact
                    label="Referring provider"
                    value={r.referringProvider}
                  />
                  <Fact label="Received" value={r.referralTime} />
                  <Fact
                    label="Attempts"
                    value={`${r.attempts.length} text outreach${r.attempts.length === 1 ? "" : "es"}`}
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
                    label="Specialty"
                    field="specialty"
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

        {/* Right: text thread + outreach timeline */}
        <div className="stack" style={{ flex: 1.6 }}>
          <SmsConversationCard
            referralId={r.id}
            dateOfBirth={r.patient.dateOfBirth}
            onReferralChanged={loadReferral}
          />
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
                No texting outreach yet. The outreach scheduler sends the first text
                once SMS consent is recorded and the referral is queued.
              </div>
            ) : (
              <div className="tl">
                {[...r.attempts].reverse().map((attempt, i, arr) => {
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
                                  background: "var(--st-escalated-fg)",
                                  borderColor: "var(--st-escalated-fg)",
                                }
                              : undefined
                          }
                        />
                        {!isLast && <div className="tl-line" />}
                      </div>
                      <div className="tl-body">
                        <div className="tl-title">
                          Text outreach #{attempt.n} · {outcomeLabel(attempt.outcome)}
                          {attempt.outcome === "Appointment Accepted" &&
                            (() => {
                              const day =
                                attempt.slotDay ??
                                r.bookedAppointment?.day ??
                                r.capturedSlot?.day;
                              return day ? ` — ${day}` : null;
                            })()}
                        </div>
                        <div className="tl-meta">{attempt.timestamp}</div>
                        {attempt.summary && (
                          <div
                            className="transcript-summary"
                            style={{ marginTop: 8, fontSize: 12.5 }}
                          >
                            {attempt.summary}
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