// Mock data for the Relay prototype.
// Realistic-feeling but synthetic. Used across screens.

const REFERRALS = [
  {
    id: "R-7821", patient: "Maria Hernandez", age: 58, sex: "F",
    lang: "Spanish", insurance: "Aetna PPO", reason: "Chest pain, exertional",
    referredBy: "Dr. Estrada (PCP)", referredAt: "Apr 14, 09:12",
    location: "Mission Bay", state: "outreach", stateLabel: "Outreach active",
    priority: "Routine", attempts: 2, badPhone: false,
    summary: "Voicemail on attempt #1. SMS sent. Patient asked about cost on attempt #2; rescheduled for evening callback.",
    nextAction: "Voice attempt #3 — today 5:30pm",
  },
  {
    id: "R-7820", patient: "James Okafor", age: 64, sex: "M",
    lang: "English", insurance: "Medicare", reason: "AFib follow-up",
    referredBy: "Dr. Chen", referredAt: "Apr 14, 08:47",
    location: "Mission Bay", state: "accepted", stateLabel: "Slot accepted — awaiting MA",
    priority: "High", attempts: 1, badPhone: false,
    summary: "Accepted Tue Apr 22, 2:15pm with Dr. Park. Confirmed insurance on file. Awaiting MA to book in practice system.",
    nextAction: "MA to confirm",
  },
  {
    id: "R-7819", patient: "Yuki Tanaka", age: 41, sex: "F",
    lang: "English", insurance: "Blue Shield", reason: "Palpitations workup",
    referredBy: "Dr. Singh", referredAt: "Apr 13, 16:30",
    location: "Daly City", state: "escalated", stateLabel: "Escalated",
    priority: "Urgent", attempts: 2, badPhone: false,
    summary: "Patient described shortness of breath at rest during call. AI routed to escalation queue per clinical safety rule.",
    nextAction: "Coordinator review — flagged 14m ago",
    escalationReason: "Clinical / distress signal",
  },
  {
    id: "R-7818", patient: "Aisha Patel", age: 33, sex: "F",
    lang: "English", insurance: "Kaiser", reason: "Hypertension consult",
    referredBy: "Dr. Brooks", referredAt: "Apr 13, 14:02",
    location: "Mission Bay", state: "booked", stateLabel: "Booked",
    priority: "Routine", attempts: 2, badPhone: false,
    summary: "Booked Wed Apr 23, 10:00am with Dr. Park. Reminders scheduled T-3 and T-1 day.",
    nextAction: "Reminder T-3 days — Apr 20",
  },
  {
    id: "R-7817", patient: "Marcus Bell", age: 49, sex: "M",
    lang: "English", insurance: "Anthem", reason: "Heart murmur eval",
    referredBy: "Dr. Estrada (PCP)", referredAt: "Apr 13, 11:18",
    location: "Mission Bay", state: "outreach", stateLabel: "Outreach active",
    priority: "Routine", attempts: 3, badPhone: false,
    summary: "Three voicemails, no callback. SMS opened twice. AI will pivot to coordinator after attempt #4 per cadence policy.",
    nextAction: "SMS reminder — tonight 7:00pm",
  },
  {
    id: "R-7816", patient: "Linh Pham", age: 72, sex: "F",
    lang: "Vietnamese", insurance: "Medicare", reason: "CHF management",
    referredBy: "Dr. Nguyen", referredAt: "Apr 12, 09:55",
    location: "Daly City", state: "queued", stateLabel: "Queued",
    priority: "High", attempts: 0, badPhone: false,
    summary: "Awaiting first outreach. Cadence starts 9am tomorrow per quiet-hours and language preference.",
    nextAction: "Voice attempt #1 — Apr 15, 9:00am",
  },
  {
    id: "R-7815", patient: "Robert Klein", age: 67, sex: "M",
    lang: "English", insurance: "Medicare", reason: "Post-MI follow-up",
    referredBy: "SF General — discharge", referredAt: "Apr 12, 08:30",
    location: "Mission Bay", state: "accepted", stateLabel: "Slot accepted — awaiting MA",
    priority: "Urgent", attempts: 1, badPhone: false,
    summary: "Accepted Mon Apr 21, 11:30am with Dr. Park. Discussed prep + transport. Caregiver will accompany.",
    nextAction: "MA to confirm",
  },
  {
    id: "R-7814", patient: "Sofia Reyes", age: 29, sex: "F",
    lang: "Spanish", insurance: "Self-pay", reason: "Arrhythmia screening",
    referredBy: "Dr. Estrada (PCP)", referredAt: "Apr 11, 17:45",
    location: "Mission Bay", state: "outreach", stateLabel: "Outreach active",
    priority: "Routine", attempts: 1, badPhone: false,
    summary: "Self-pay; asked AI about a cash estimate. AI gave the published self-pay range and offered evening slot.",
    nextAction: "Voice attempt #2 — Apr 16, 6:30pm",
  },
  {
    id: "R-7813", patient: "David Wu", age: 55, sex: "M",
    lang: "English", insurance: "Cigna", reason: "Stress test referral",
    referredBy: "Dr. Brooks", referredAt: "Apr 11, 13:10",
    location: "Mission Bay", state: "ingested", stateLabel: "Ingested",
    priority: "Routine", attempts: 0, badPhone: true,
    summary: "Phone number flagged invalid (404 area code, 10 digits don't validate). Awaiting bad-data fix.",
    nextAction: "Coordinator: fix contact",
  },
  {
    id: "R-7812", patient: "Helena Brandt", age: 61, sex: "F",
    lang: "English", insurance: "Aetna", reason: "Pre-op clearance",
    referredBy: "Dr. Reyes (Ortho)", referredAt: "Apr 10, 11:22",
    location: "Mission Bay", state: "won", stateLabel: "Closed-won",
    priority: "High", attempts: 2, badPhone: false,
    summary: "Visit completed Apr 9. Closed-loop summary sent to Dr. Reyes. Recovered revenue: $412 (est).",
    nextAction: "Closed-loop sent",
  },
  {
    id: "R-7811", patient: "Omar Haidari", age: 38, sex: "M",
    lang: "English", insurance: "United", reason: "Chest pain workup",
    referredBy: "Dr. Lee", referredAt: "Apr 10, 09:00",
    location: "Mission Bay", state: "lost", stateLabel: "Closed-lost",
    priority: "Routine", attempts: 5, badPhone: false,
    summary: "Five attempts across voice + SMS over 9 days. Patient declined. Eligible for re-activation in 60 days.",
    nextAction: "Re-activatable Jun 9",
  },
  {
    id: "R-7810", patient: "Beatriz Coelho", age: 47, sex: "F",
    lang: "Portuguese", insurance: "Blue Shield", reason: "Palpitations",
    referredBy: "Dr. Singh", referredAt: "Apr 9, 15:48",
    location: "Daly City", state: "booked", stateLabel: "Booked",
    priority: "Routine", attempts: 2, badPhone: false,
    summary: "Booked Apr 24, 3:00pm. Portuguese-preferred voice agent used; reminders in Portuguese.",
    nextAction: "Reminder T-3 days — Apr 21",
  },
];

const ACTION_QUEUE = REFERRALS
  .filter(r => r.state === "accepted")
  .map(r => ({
    ...r,
    capturedSlot: r.id === "R-7820"
      ? { date: "Tue Apr 22", time: "2:15pm", provider: "Dr. Park", location: "Mission Bay" }
      : { date: "Mon Apr 21", time: "11:30am", provider: "Dr. Park", location: "Mission Bay" },
    capturedAt: r.id === "R-7820" ? "11 min ago" : "38 min ago",
  }));

const ALERTS = [
  {
    id: "E-104", patient: "Yuki Tanaka", patientId: "R-7819",
    reason: "Clinical / distress signal", severity: "high",
    triggerQuote: "\u201CIt's hard to breathe even when I'm sitting still\u2014I thought I should just wait...\u201D",
    when: "14 min ago", owner: null,
  },
  {
    id: "E-103", patient: "Naveen Iyer", patientId: "R-7809",
    reason: "Wrong number / not the patient", severity: "med",
    triggerQuote: "Recipient stated this is not Naveen and they don't know him. Cadence halted.",
    when: "1h ago", owner: "Denise C.",
  },
  {
    id: "E-102", patient: "Eleanor Park", patientId: "R-7806",
    reason: "Bad data — incomplete referral", severity: "low",
    triggerQuote: "Referral missing referring provider + reason. Cannot validate before outreach.",
    when: "3h ago", owner: null,
  },
];

const CALLS = [
  { id: "C-4022", time: "10:48 AM", patient: "Maria Hernandez", patientId: "R-7821",
    attempt: 2, channel: "voice", outcome: "connected", outcomeLabel: "Connected — friction resolved",
    duration: "4:12", summary: "Discussed cost. Patient agreed to call back tonight to choose evening slot.",
    disclosure: true, escalated: false, lang: "Spanish" },
  { id: "C-4021", time: "10:31 AM", patient: "James Okafor", patientId: "R-7820",
    attempt: 1, channel: "voice", outcome: "accepted", outcomeLabel: "Slot accepted",
    duration: "6:08", summary: "Accepted Tue 4/22 at 2:15pm with Dr. Park. Verified insurance on file.",
    disclosure: true, escalated: false, lang: "English" },
  { id: "C-4020", time: "10:14 AM", patient: "Yuki Tanaka", patientId: "R-7819",
    attempt: 2, channel: "voice", outcome: "escalated", outcomeLabel: "Escalated — clinical",
    duration: "2:47", summary: "Patient described shortness of breath at rest. AI invoked safety handoff per script.",
    disclosure: true, escalated: true, lang: "English" },
  { id: "C-4019", time: "9:58 AM", patient: "Marcus Bell", patientId: "R-7817",
    attempt: 3, channel: "voice", outcome: "voicemail", outcomeLabel: "Voicemail",
    duration: "0:48", summary: "Left compliant minimal-PHI voicemail. SMS fallback queued.",
    disclosure: true, escalated: false, lang: "English" },
  { id: "C-4018", time: "9:41 AM", patient: "Marcus Bell", patientId: "R-7817",
    attempt: 3, channel: "sms", outcome: "delivered", outcomeLabel: "SMS delivered",
    duration: "—", summary: "Callback link sent. Two prior SMS opened; no reply yet.",
    disclosure: false, escalated: false, lang: "English" },
  { id: "C-4017", time: "9:22 AM", patient: "Sofia Reyes", patientId: "R-7814",
    attempt: 1, channel: "voice", outcome: "noanswer", outcomeLabel: "No answer",
    duration: "0:00", summary: "Ringtone ended at 22s. No voicemail box. Next attempt scheduled different time-of-day.",
    disclosure: false, escalated: false, lang: "Spanish" },
  { id: "C-4016", time: "9:03 AM", patient: "Robert Klein", patientId: "R-7815",
    attempt: 1, channel: "voice", outcome: "accepted", outcomeLabel: "Slot accepted",
    duration: "8:14", summary: "Post-MI follow-up booked Apr 21 11:30. Discussed transport; caregiver confirmed.",
    disclosure: true, escalated: false, lang: "English" },
  { id: "C-4015", time: "8:47 AM", patient: "Helena Brandt", patientId: "R-7812",
    attempt: 0, channel: "voice", outcome: "outbound-confirm", outcomeLabel: "Confirmation — T-1 day",
    duration: "1:22", summary: "Confirmation call for tomorrow's visit. Patient re-confirmed. Prep instructions resent.",
    disclosure: true, escalated: false, lang: "English" },
];

const TRANSCRIPT_SAMPLE = {
  patient: "Maria Hernandez",
  call: "C-4022 · Attempt #2 · Voice · 4m 12s",
  disclosure: true,
  summary: "Patient asked about cost. AI surfaced expected coverage under Aetna PPO and offered an evening slot. Patient asked to call back tonight at 6:30pm to choose between two windows.",
  turns: [
    { who: "AI", time: "0:00", text: "Hi, this is the Relay assistant calling on behalf of Dr. Estrada's office. I'm an AI helping schedule your cardiology referral. Is this Maria?" },
    { who: "Maria", time: "0:09", text: "Yes, this is she." },
    { who: "AI", time: "0:11", text: "Great. Your primary doctor sent us a referral for chest pain that comes on with exertion. We'd like to get you in this week or next. Before we look at times, is there anything you'd like to ask about it?" },
    { who: "Maria", time: "0:26", text: "I just want to know what it's going to cost. I have Aetna." },
    { who: "AI", time: "0:31", text: "Of course. With Aetna PPO, a specialist consult is typically a copay between $35 and $50 — your portal will show your exact number. We can confirm coverage live before the visit if you'd like." },
    { who: "Maria", time: "0:49", text: "Okay. Do you have anything after work? I can't take time off." },
    { who: "AI", time: "0:54", text: "We do — Tuesday at 5:15pm or Thursday at 5:30pm both work. Or if you'd like to think it over, I can send a text and you can pick when you're ready." },
    { who: "Maria", time: "1:12", text: "Let me call back tonight. Around 6:30." },
    { who: "AI", time: "1:16", text: "Sounds good — I'll send a quick text confirming our number so you can reach me directly. Thanks, Maria." },
  ]
};

window.RELAY_DATA = { REFERRALS, ACTION_QUEUE, ALERTS, CALLS, TRANSCRIPT_SAMPLE };
