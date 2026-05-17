/**
 * mockData.js — SINGLE SOURCE OF MOCK DATA FOR THE RELAY PROTOTYPE
 *
 * Every screen imports from this file. No component may hardcode its own data.
 * This is the swap point for real data later: keep the shape, replace the source.
 *
 * Consistency contract (the prototype looks fake if these drift):
 *  - dashboard.pipeline counts === actual counts of referrals by state
 *  - dashboard.callActivity numbers are presentational; they need not sum from calls[]
 *    but should look plausible against it
 *  - confirmQueue items are exactly the referrals in state "Slot accepted"
 *  - urgentAlerts items are exactly the referrals in state "Escalated"
 *  - sidebarCounts mirror the live arrays
 *
 * State names & colors: see REFERRAL_STATUSES.md (do not invent variants).
 * Scope: connector mode only. "Booked" means the MA confirmed in the practice
 * system; there is no native-calendar write anywhere in this data.
 */

// ---------------------------------------------------------------------------
// ORG / SESSION  (matches the design baseline header)
// ---------------------------------------------------------------------------
export const org = {
  productName: "Relay",
  practiceName: "Bay Cardiology",
  site: "Mission Bay",
  environment: "Production",
  specialty: "Cardiology",
};

export const currentUser = {
  name: "Priya",
  fullName: "Priya Anand",
  role: "Medical Assistant",
  initials: "P",
  today: "Apr 14",
};

// ---------------------------------------------------------------------------
// STATE COLOR MAP  (single source — the shared state pill reads this)
// Hexes approximate the baseline; sample exact values from the screenshot.
// ---------------------------------------------------------------------------
export const stateColors = {
  "Queued":        { fg: "#3B53B5", bg: "#E7E9FB", dot: "#5A6FE0" },
  "Outreach":      { fg: "#3F6592", bg: "#E4ECF5", dot: "#5B82AE" },
  "Slot accepted": { fg: "#9A6B16", bg: "#FBEFD6", dot: "#C58A2A" },
  "Booked":        { fg: "#0F7A57", bg: "#DEF1E9", dot: "#15976C" },
  "Escalated":     { fg: "#B5413B", bg: "#FBE3E1", dot: "#D8534B" },
  "Closed-won":    { fg: "#3F7A43", bg: "#E3EFE2", dot: "#5C9A60" },
  "Closed-lost":   { fg: "#5B6B63", bg: "#ECEFED", dot: "#8A958E" },
};

// Two-tier urgency — distinct from the Escalated STATE. Do not merge.
export const urgencyColors = {
  needsHuman: { fg: "#9A6B16", bg: "#FBEFD6", border: "#E6C277" }, // soft amber
  escalated:  { fg: "#B5413B", bg: "#FBE3E1", border: "#E7A6A1" }, // red/coral
};

export const priorityColors = {
  urgent: { fg: "#B5413B", bg: "#FBE3E1" },
  normal: { fg: "#5B6B63", bg: "#ECEFED" },
};

// ---------------------------------------------------------------------------
// REFERRALS  (the spine — 16 records spanning every state)
// attempts[] carry transcripts + summaries used by detail & call log screens.
// ---------------------------------------------------------------------------
export const referrals = [
  {
    id: "REF-1042",
    patient: { name: "James Okafor", age: 67, sex: "M", phone: "(415) 555-0173",
      language: "English", insurance: "Medicare" },
    reason: "AFib follow-up",
    referringProvider: "Dr. Chen",
    referralSource: "Bay Cardiology — internal",
    referralTime: "Apr 14, 8:21 AM",
    location: "Mission Bay",
    priority: "normal",
    state: "Slot accepted",
    capturedSlot: { day: "Tue Apr 22", time: "2:15pm", provider: "Dr. Park", capturedAgoMin: 11 },
    attempts: [
      { n: 1, timestamp: "Apr 14, 9:02 AM", channel: "voice", outcome: "no_answer",
        duration: "0:00", disclosurePlayed: false, summary: "No answer, no voicemail left.", transcript: [] },
      { n: 2, timestamp: "Apr 14, 1:40 PM", channel: "voice", outcome: "connected",
        duration: "3:24", disclosurePlayed: true,
        summary: "Patient reached. AI explained the AFib follow-up referral and resolved a cost concern by confirming Medicare coverage. Patient accepted Tue Apr 22 at 2:15pm with Dr. Park.",
        transcript: [
          { who: "ai", text: "Hi, this is an automated assistant calling on behalf of Bay Cardiology. Is this James?" },
          { who: "patient", text: "Yes, who is this again?" },
          { who: "ai", text: "An AI assistant for Bay Cardiology. Dr. Chen referred you for an atrial fibrillation follow-up. Do you have a minute?" },
          { who: "patient", text: "I guess. I wasn't sure I really needed it, and I didn't know what it'd cost." },
          { who: "ai", text: "It's a follow-up to check on your heart rhythm and medication. With Medicare this visit is typically fully covered. Would a weekday afternoon work?" },
          { who: "patient", text: "Afternoons are better, yeah." },
          { who: "ai", text: "I have Tuesday April 22nd at 2:15pm with Dr. Park. Shall I hold that for you?" },
          { who: "patient", text: "That works." },
          { who: "ai", text: "Great — our staff will confirm it and you'll get a text shortly. Thank you, James." },
        ] },
    ],
    audit: [{ at: "Apr 14, 1:43 PM", who: "AI agent", what: "Captured slot Tue Apr 22 2:15pm" }],
  },
  {
    id: "REF-1039",
    patient: { name: "Robert Klein", age: 72, sex: "M", phone: "(415) 555-0148",
      language: "English", insurance: "Medicare" },
    reason: "Post-MI follow-up",
    referringProvider: "SF General — discharge",
    referralSource: "SF General — discharge",
    referralTime: "Apr 13, 4:55 PM",
    location: "Mission Bay",
    priority: "urgent",
    state: "Slot accepted",
    capturedSlot: { day: "Mon Apr 21", time: "11:30am", provider: "Dr. Park", capturedAgoMin: 38 },
    attempts: [
      { n: 1, timestamp: "Apr 14, 8:30 AM", channel: "voice", outcome: "connected",
        duration: "4:01", disclosurePlayed: true,
        summary: "Post-MI discharge referral. Patient anxious about returning so soon; AI reassured, did not push, and secured Mon Apr 21 11:30am with Dr. Park.",
        transcript: [
          { who: "ai", text: "Hi, this is an automated assistant for Bay Cardiology. Am I speaking with Robert?" },
          { who: "patient", text: "Yes." },
          { who: "ai", text: "You were referred after your recent hospital stay for a heart attack follow-up. This one's important to schedule soon. Is now an okay time?" },
          { who: "patient", text: "It's been a stressful couple weeks, honestly." },
          { who: "ai", text: "That's completely understandable. This visit is mostly a check-in to make sure your recovery is on track. Would a morning be easier for you?" },
          { who: "patient", text: "Mornings, yes." },
          { who: "ai", text: "I can hold Monday April 21st at 11:30am with Dr. Park." },
          { who: "patient", text: "Okay, let's do that." },
        ] },
    ],
    audit: [{ at: "Apr 14, 8:34 AM", who: "AI agent", what: "Captured slot Mon Apr 21 11:30am" }],
  },
  {
    id: "REF-1051",
    patient: { name: "Maria Delgado", age: 58, sex: "F", phone: "(415) 555-0192",
      language: "Spanish", insurance: "Blue Shield PPO" },
    reason: "New murmur, echo recommended",
    referringProvider: "Dr. Alvarez (PCP)",
    referralSource: "Fax — Alvarez Family Medicine",
    referralTime: "Apr 14, 7:10 AM",
    location: "Mission Bay",
    priority: "normal",
    state: "Outreach",
    capturedSlot: null,
    attempts: [
      { n: 1, timestamp: "Apr 14, 10:15 AM", channel: "voice", outcome: "voicemail",
        duration: "0:38", disclosurePlayed: true,
        summary: "Voicemail left (practice + callback only, no clinical detail). SMS fallback triggered in Spanish.",
        transcript: [
          { who: "ai", text: "Hello, this is a message from Bay Cardiology. Please call us back at your convenience. Thank you." },
        ] },
      { n: 2, timestamp: "Apr 14, 10:16 AM", channel: "sms", outcome: "no_answer",
        duration: "—", disclosurePlayed: false,
        summary: "SMS sent in Spanish with callback link. Awaiting response.", transcript: [] },
    ],
    audit: [{ at: "Apr 14, 10:16 AM", who: "System", what: "SMS fallback (es) sent" }],
  },
  {
    id: "REF-1047",
    patient: { name: "Walter Briggs", age: 64, sex: "M", phone: "(415) 555-0110",
      language: "English", insurance: "Aetna" },
    reason: "Chest pain, urgent eval",
    referringProvider: "Dr. Chen",
    referralSource: "Bay Cardiology — internal",
    referralTime: "Apr 14, 6:02 AM",
    location: "Mission Bay",
    priority: "urgent",
    state: "Escalated",
    escalation: { reason: "Patient reported active chest pain during the call",
      severity: "high", raisedAt: "Apr 14, 9:48 AM", owner: null },
    capturedSlot: null,
    attempts: [
      { n: 1, timestamp: "Apr 14, 9:46 AM", channel: "voice", outcome: "escalated",
        duration: "1:12", disclosurePlayed: true,
        summary: "ESCALATED: patient described chest pain currently. AI stopped scheduling, advised it could not give medical guidance, and flagged for immediate human callback.",
        transcript: [
          { who: "ai", text: "Hi, this is an automated assistant for Bay Cardiology calling about a referral from Dr. Chen." },
          { who: "patient", text: "Okay — honestly I've been having some chest tightness right now." },
          { who: "ai", text: "Thank you for telling me. I'm not able to give medical advice, and I'm going to have a member of the care team call you back right away. If this feels severe, please call 911." },
          { who: "patient", text: "Alright." },
        ] },
    ],
    audit: [{ at: "Apr 14, 9:48 AM", who: "AI agent", what: "Escalated — clinical (chest pain)" }],
  },
  {
    id: "REF-1033",
    patient: { name: "Yuki Tanaka", age: 51, sex: "F", phone: "(415) 555-0166",
      language: "English", insurance: "Kaiser" },
    reason: "Palpitations workup",
    referringProvider: "Dr. Osei (PCP)",
    referralSource: "EHR feed",
    referralTime: "Apr 12, 2:30 PM",
    location: "Mission Bay",
    priority: "normal",
    state: "Booked",
    capturedSlot: { day: "Thu Apr 17", time: "9:00am", provider: "Dr. Lin", capturedAgoMin: null },
    bookedAppointment: { day: "Thu Apr 17", time: "9:00am", provider: "Dr. Lin",
      confirmedBy: "Priya Anand", confirmedAt: "Apr 13, 11:05 AM", mirrorStatus: "mirrored" },
    attempts: [
      { n: 1, timestamp: "Apr 13, 10:50 AM", channel: "voice", outcome: "connected",
        duration: "2:48", disclosurePlayed: true,
        summary: "Patient accepted Thu Apr 17 9:00am with Dr. Lin. MA confirmed in practice system; mirrored to shadow calendar.",
        transcript: [
          { who: "ai", text: "Hi, this is an automated assistant for Bay Cardiology. Is this Yuki?" },
          { who: "patient", text: "Speaking." },
          { who: "ai", text: "Dr. Osei referred you for a palpitations workup. Can I help you find a time?" },
          { who: "patient", text: "Sure, mornings are best." },
          { who: "ai", text: "I can hold Thursday April 17th at 9:00am with Dr. Lin." },
          { who: "patient", text: "Perfect." },
        ] },
    ],
    audit: [
      { at: "Apr 13, 10:53 AM", who: "AI agent", what: "Captured slot Thu Apr 17 9:00am" },
      { at: "Apr 13, 11:05 AM", who: "Priya Anand", what: "Confirmed in practice system" },
      { at: "Apr 13, 11:05 AM", who: "System", what: "Mirrored to shadow calendar" },
    ],
  },
  {
    id: "REF-1058",
    patient: { name: "Grace Mwangi", age: 45, sex: "F", phone: "(415) 555-0204",
      language: "English", insurance: "United PPO" },
    reason: "Hypertension referral",
    referringProvider: "Dr. Alvarez (PCP)",
    referralSource: "Fax — Alvarez Family Medicine",
    referralTime: "Apr 14, 7:45 AM",
    location: "Mission Bay",
    priority: "normal",
    state: "Queued",
    capturedSlot: null,
    attempts: [],
    audit: [{ at: "Apr 14, 7:46 AM", who: "System", what: "Ingested, validated, queued" }],
  },
  {
    id: "REF-1059",
    patient: { name: "Daniel Reyes", age: 60, sex: "M", phone: "(415) 555-0211",
      language: "English", insurance: "Medicare" },
    reason: "Pre-op cardiac clearance",
    referringProvider: "Ortho — Dr. Singh",
    referralSource: "Referral platform",
    referralTime: "Apr 14, 7:58 AM",
    location: "Mission Bay",
    priority: "urgent",
    state: "Queued",
    capturedSlot: null,
    attempts: [],
    audit: [{ at: "Apr 14, 7:59 AM", who: "System", what: "Ingested, urgent-triaged, queued" }],
  },
  {
    id: "REF-1061",
    patient: { name: "Helen Park", age: 69, sex: "F", phone: "(415) 555-0220",
      language: "Korean", insurance: "Medicare Advantage" },
    reason: "Heart failure follow-up",
    referringProvider: "SF General — discharge",
    referralSource: "SF General — discharge",
    referralTime: "Apr 14, 6:40 AM",
    location: "Mission Bay",
    priority: "normal",
    state: "Queued",
    capturedSlot: null,
    attempts: [],
    audit: [{ at: "Apr 14, 6:41 AM", who: "System", what: "Ingested, validated, queued" }],
  },
  {
    id: "REF-1062",
    patient: { name: "Marcus Hill", age: 55, sex: "M", phone: "(415) 555-0231",
      language: "English", insurance: "Cigna" },
    reason: "Abnormal EKG",
    referringProvider: "Dr. Osei (PCP)",
    referralSource: "EHR feed",
    referralTime: "Apr 14, 8:05 AM",
    location: "Mission Bay",
    priority: "normal",
    state: "Queued",
    capturedSlot: null,
    attempts: [],
    audit: [{ at: "Apr 14, 8:06 AM", who: "System", what: "Ingested, validated, queued" }],
  },
  // --- Outreach (in-cadence). In-motion must total 38 (baseline screenshot):
  // Queued 4 + Outreach 30 + Slot accepted 2 + Booked 1 + Escalated 1 = 38.
  // 1 explicit Outreach above (REF-1051) + 29 generated below. ---
  ...Array.from({ length: 29 }).map((_, i) => {
    const names = ["Linda Brown","Omar Farah","Nina Petrov","Carl Jensen","Aisha Bello",
      "Tom Whitaker","Sara Kim","Luis Mendez","Ruth Cohen","Ben Adler","Priscilla Vance",
      "Hassan Ali","Joan Pierce","Derek Stone","Mei Wong","Frank Russo","Ivy Coleman",
      "Paul Eriksen","Donna Vargas","Keith Obi","Lena Schultz","Marco Bianchi",
      "Tara Quinn","Sanjay Rao","Brenda Voss","Eli Tanaka","Naomi Frost",
      "Oscar Pena","Wanda Gill"];
    const reasons = ["Arrhythmia eval","Syncope workup","Valve follow-up","Chest pain eval",
      "Lipid management","Pacemaker check","Cardiomyopathy f/u","Hypertension referral"];
    const langs = ["English","English","English","Spanish","English","Mandarin","English"];
    const ins = ["Medicare","Aetna","Blue Shield PPO","United PPO","Kaiser","Cigna","Medicare Advantage"];
    return {
      id: `REF-10${70 + i}`,
      patient: { name: names[i], age: 50 + (i % 30), sex: i % 2 ? "F" : "M",
        phone: `(415) 555-0${300 + i}`, language: langs[i % langs.length],
        insurance: ins[i % ins.length] },
      reason: reasons[i % reasons.length],
      referringProvider: ["Dr. Chen","Dr. Alvarez (PCP)","Dr. Osei (PCP)","SF General — discharge"][i % 4],
      referralSource: ["Bay Cardiology — internal","Fax — Alvarez Family Medicine","EHR feed","SF General — discharge"][i % 4],
      referralTime: `Apr ${10 + (i % 5)}, ${8 + (i % 6)}:${(i * 7) % 60 < 10 ? "0" : ""}${(i * 7) % 60} AM`,
      location: "Mission Bay",
      priority: i % 6 === 0 ? "urgent" : "normal",
      state: "Outreach",
      capturedSlot: null,
      attempts: [
        { n: 1, timestamp: `Apr ${11 + (i % 4)}, 9:${(i * 3) % 60 < 10 ? "0" : ""}${(i * 3) % 60} AM`,
          channel: i % 3 === 0 ? "sms" : "voice",
          outcome: ["no_answer","voicemail","no_answer"][i % 3], duration: i % 3 === 1 ? "0:31" : "0:00",
          disclosurePlayed: i % 3 === 1,
          summary: i % 3 === 1 ? "Voicemail left; SMS fallback queued." : "No answer; next attempt scheduled at a varied time.",
          transcript: [] },
      ],
      audit: [{ at: "auto", who: "System", what: "In cadence" }],
    };
  }),
  // --- Closed-won (completed). Target = 4. ---
  ...["Evelyn Carter","Sam Ortega","Rebecca Lin","George Bauer"].map((nm, i) => ({
    id: `REF-100${i + 1}`,
    patient: { name: nm, age: 60 + i * 2, sex: i % 2 ? "F" : "M",
      phone: `(415) 555-04${10 + i}`, language: "English",
      insurance: ["Medicare","Aetna","Kaiser","Medicare"][i] },
    reason: ["AFib follow-up","Post-MI follow-up","Palpitations workup","Valve follow-up"][i],
    referringProvider: ["Dr. Chen","SF General — discharge","Dr. Osei (PCP)","Dr. Chen"][i],
    referralSource: ["Bay Cardiology — internal","SF General — discharge","EHR feed","Bay Cardiology — internal"][i],
    referralTime: `Apr ${5 + i}, 9:15 AM`,
    location: "Mission Bay",
    priority: "normal",
    state: "Closed-won",
    capturedSlot: { day: `Apr ${8 + i}`, time: "10:00am", provider: "Dr. Lin", capturedAgoMin: null },
    bookedAppointment: { day: `Apr ${8 + i}`, time: "10:00am", provider: "Dr. Lin",
      confirmedBy: "Priya Anand", confirmedAt: `Apr ${6 + i}, 2:00 PM`, mirrorStatus: "mirrored" },
    visitCompletedAt: `Apr ${8 + i}, 10:42 AM`,
    closedLoopSent: true,
    attempts: [
      { n: 1, timestamp: `Apr ${6 + i}, 1:50 PM`, channel: "voice", outcome: "connected",
        duration: "2:30", disclosurePlayed: true,
        summary: "Completed visit; closed-loop summary sent to referring provider.", transcript: [] },
    ],
    audit: [
      { at: `Apr ${6 + i}, 2:00 PM`, who: "Priya Anand", what: "Confirmed in practice system" },
      { at: `Apr ${8 + i}, 10:42 AM`, who: "System", what: "Visit completed → Closed-won" },
      { at: `Apr ${8 + i}, 10:45 AM`, who: "System", what: "Closed-loop report sent to referring provider" },
    ],
  })),
  // --- Closed-lost (re-activatable). Target = 3. ---
  ...["Patricia Nolan","Victor Shaw","Dana Lemke"].map((nm, i) => ({
    id: `REF-099${i + 1}`,
    patient: { name: nm, age: 58 + i * 3, sex: i % 2 ? "F" : "M",
      phone: `(415) 555-05${10 + i}`, language: "English",
      insurance: ["Medicare","United PPO","Aetna"][i] },
    reason: ["Hypertension referral","Arrhythmia eval","Lipid management"][i],
    referringProvider: ["Dr. Alvarez (PCP)","Dr. Osei (PCP)","Dr. Chen"][i],
    referralSource: ["Fax — Alvarez Family Medicine","EHR feed","Bay Cardiology — internal"][i],
    referralTime: `Apr ${2 + i}, 8:00 AM`,
    location: "Mission Bay",
    priority: "normal",
    state: "Closed-lost",
    closedReason: ["Cadence exhausted — no contact after 6 attempts",
      "Patient declined — using another cardiologist",
      "Cadence exhausted — voicemail only"][i],
    reactivationEligible: true,
    capturedSlot: null,
    attempts: [
      { n: 6, timestamp: `Apr ${4 + i}, 4:00 PM`, channel: "sms", outcome: "no_answer",
        duration: "—", disclosurePlayed: false,
        summary: "Final attempt; cadence exhausted. Eligible for future re-activation.", transcript: [] },
    ],
    audit: [{ at: `Apr ${4 + i}, 4:05 PM`, who: "System", what: "Closed-lost (re-activatable)" }],
  })),
];

// ---------------------------------------------------------------------------
// DERIVED VIEWS  (computed from referrals[] so they can never drift)
// ---------------------------------------------------------------------------
const countBy = (st) => referrals.filter((r) => r.state === st).length;

export const pipeline = [
  { state: "Queued",        count: countBy("Queued") },
  { state: "Outreach",      count: countBy("Outreach") },
  { state: "Slot accepted", count: countBy("Slot accepted") },
  { state: "Booked",        count: countBy("Booked") },
  { state: "Escalated",     count: countBy("Escalated") },
  { state: "Closed-won",    count: countBy("Closed-won") },
  { state: "Closed-lost",   count: countBy("Closed-lost") },
];

export const referralsInMotion =
  referrals.filter((r) => !["Closed-won", "Closed-lost"].includes(r.state)).length;

export const confirmQueue = referrals
  .filter((r) => r.state === "Slot accepted")
  .map((r) => ({
    referralId: r.id, patient: r.patient.name, reason: r.reason,
    referringProvider: r.referringProvider, dischargeNote: r.referralSource,
    language: r.patient.language, insurance: r.patient.insurance,
    slot: r.capturedSlot, capturedAgoMin: r.capturedSlot?.capturedAgoMin ?? null,
    priority: r.priority,
  }));

export const urgentAlerts = referrals
  .filter((r) => r.state === "Escalated")
  .map((r) => ({
    referralId: r.id, patient: r.patient.name, reason: r.escalation?.reason,
    severity: r.escalation?.severity, raisedAt: r.escalation?.raisedAt,
    owner: r.escalation?.owner,
    transcriptExcerpt: r.attempts?.[r.attempts.length - 1]?.transcript?.slice(-2) ?? [],
  }));

// ---------------------------------------------------------------------------
// DASHBOARD  (presentational metrics — match the baseline screenshot)
// ---------------------------------------------------------------------------
export const dashboard = {
  greetingDate: "Apr 14",
  referralsInMotion, // 38 with the data above
  escalationsNeedingHuman: countBy("Escalated"),
  layoutModes: ["Action-first", "Vitals-first", "Split rhythm"],
  defaultLayoutMode: "Vitals-first",
  callActivity: {
    window: "last 24h · vs. typical day",
    metrics: [
      { label: "Calls made",    value: 142, delta: "+18",      deltaDir: "up" },
      { label: "Connected",     value: 61,  sub: "43% pickup" },
      { label: "Slots captured",value: 14,  delta: "+4",       deltaDir: "up" },
      { label: "Confirmations", value: 11,  sub: "3 in queue" },
      { label: "No-answers",    value: 63,  delta: "-7",       deltaDir: "down" },
    ],
  },
};

// ---------------------------------------------------------------------------
// AI CALL LOG  (flattened from referrals[].attempts so it always agrees)
// ---------------------------------------------------------------------------
export const callLog = referrals.flatMap((r) =>
  (r.attempts || []).map((a) => ({
    referralId: r.id, patient: r.patient.name, language: r.patient.language,
    timestamp: a.timestamp, attempt: a.n, channel: a.channel, outcome: a.outcome,
    duration: a.duration, summary: a.summary,
    hasTranscript: (a.transcript && a.transcript.length > 0),
    escalated: a.outcome === "escalated", disclosurePlayed: a.disclosurePlayed,
  }))
).sort((x, y) => (x.timestamp < y.timestamp ? 1 : -1));

// ---------------------------------------------------------------------------
// CALENDAR  (read-only mirror — confirmed + completed bookings only)
// ---------------------------------------------------------------------------
export const calendarEvents = referrals
  .filter((r) => r.bookedAppointment)
  .map((r) => ({
    referralId: r.id, patient: r.patient.name,
    day: r.bookedAppointment.day, time: r.bookedAppointment.time,
    provider: r.bookedAppointment.provider,
    state: r.state, // Booked or Closed-won
    mirrorStatus: r.bookedAppointment.mirrorStatus, // shows it is a mirror, read-only
  }));

// ---------------------------------------------------------------------------
// ANALYTICS  (administrator ROI — presentational; story = healthy lift)
// ---------------------------------------------------------------------------
export const analytics = {
  dateRange: "Last 30 days",
  funnel: [
    { stage: "Referrals received",   count: 412 },
    { stage: "Contacted",            count: 351 },
    { stage: "Slot accepted",        count: 188 },
    { stage: "Confirmed (booked)",   count: 171 },
    { stage: "Visit completed",      count: 154 },
  ],
  conversionLift: { baselinePct: 38, currentPct: 61, deltaPct: 23 },
  recoveredRevenue: { amount: 287400, currency: "USD", basis: "converted + backlog re-activations" },
  backlogReactivation: { deadReferralsRun: 240, recoveredVisits: 33, revenue: 61500 },
  leakageByStage: [
    { stage: "Referral → contact",   lostPct: 15, topSource: "Fax — Alvarez Family Medicine" },
    { stage: "Contact → slot",       lostPct: 46, topSource: "SF General — discharge" },
    { stage: "Slot → confirmed",     lostPct: 9,  topSource: "EHR feed" },
    { stage: "Confirmed → completed",lostPct: 10, topSource: "—" },
  ],
  shadowFidelity: { // migration-readiness signal — render visually distinct
    currentPct: 97.4,
    trend: [91.0, 93.2, 94.1, 95.5, 96.0, 96.8, 97.4],
    threshold: 99.0,
    status: "below_threshold", // not yet migration-ready
    note: "Mirror fidelity vs. the practice's real schedule. Migration trigger is sustained ≥ 99%.",
  },
  compliance: {
    aiDisclosureRate: 100, quietHourAdherence: 100,
    optOutsHonored: 7, voicemailPhiMinimized: 100,
  },
};

// ---------------------------------------------------------------------------
// SIDEBAR  (counts mirror live arrays — see the baseline)
// ---------------------------------------------------------------------------
export const sidebarCounts = {
  urgentAlerts: urgentAlerts.length,        // 1
  confirmQueue: confirmQueue.length,        // 2
  referrals: referrals.filter((r) => !["Closed-won","Closed-lost"].includes(r.state)).length,
};

export const settingsDefaults = {
  cadence: { attempts: ["Day 1 AM", "Day 1 PM", "Day 3", "Day 5", "Day 8", "Day 12"],
    channelEscalation: "voice → voice (varied time) → SMS → human", stopRules: ["Booked","Opt-out","6 attempts exhausted"] },
  quietHours: { start: "8:00 PM", end: "8:00 AM", timezone: "America/Los_Angeles" },
  aiDisclosure: { locked: true,
    text: "This is an automated assistant calling on behalf of {practice}." },
  escalationTriggers: ["Reported clinical symptom", "Patient distress", "Wrong number / not the patient", "Explicit request for a human"],
  practiceProfile: { specialty: "Cardiology", providers: ["Dr. Park","Dr. Lin","Dr. Chen"],
    locations: ["Mission Bay"], languages: ["English","Spanish","Mandarin","Korean"] },
};

export default {
  org, currentUser, stateColors, urgencyColors, priorityColors,
  referrals, pipeline, referralsInMotion, confirmQueue, urgentAlerts,
  dashboard, callLog, calendarEvents, analytics, sidebarCounts, settingsDefaults,
};
