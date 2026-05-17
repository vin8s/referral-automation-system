# PRODUCT_SPEC.md

**Voice AI Referral Conversion Platform**
Single engineering source of truth. Consolidates the product thesis, scope boundary, architecture, data model, state machines, UI surface, and build order. If this file disagrees with older documents, this file wins.

- **Status:** Working draft for prototype scoping
- **MVP scope:** Connector-first with a one-way shadow native calendar
- **Primary buyer:** Specialist practice / group
- **Primary users:** Referral coordinator, Medical Assistant (MA); secondary: practice administrator, referring provider

---

## 1. Problem & thesis

Most specialist referral leakage does not happen because patients refuse care. It happens because a single unanswered phone call ends the practice's outreach. The platform replaces that single attempt with a persistent, multi-attempt, multi-channel outreach engine led by conversational voice AI, and closes the loop back to the referring provider.

**Thesis in one line:** a submitted referral that gets one missed call today instead receives an orchestrated sequence of AI voice attempts (with SMS fallback) that diagnoses friction, gets the appointment booked, and reports the outcome back to the referring provider.

**Why this is not just an auto-dialer:** the defensibility is owning the scheduling calendar. That converts an unbounded "integrate with every practice's scheduling system" problem into a single bounded "our calendar ↔ Epic/EHR" integration, and turns the product from a replaceable feature into a system of record staff live in daily.

---

## 2. Scope boundary (read this before building anything)

The product is **two modes that share one engine.** The MVP ships Connector mode and runs the native calendar only as a silent one-way mirror.

| Dimension | Connector mode — **MVP, build this** | Native mode — **post-migration, do NOT build** |
|---|---|---|
| Source of truth | Practice's existing scheduling system | Our AI-native calendar |
| What the AI does | Qualifies; captures intent + accepted slot | Proposes appointments directly onto the calendar |
| Who commits the booking | MA enters/confirms in their own system | MA approves AI proposal from a native queue |
| Native calendar role | One-way mirror: read-only copy, not authoritative | Authoritative system of record |
| Integration burden | Lightweight read of availability | One bounded integration: our calendar ↔ Epic/EHR |

### In MVP scope
- Referral ingestion (manual upload first), validation, dedupe, urgency triage
- Persistent multi-attempt cadence engine (voice-led, SMS fallback)
- Conversational voice AI: disclosure, friction resolution, accepted-slot capture
- Connector: read-only availability + MA accepted-slot worklist + mark-confirmed
- Native calendar **data model + one-way mirror writer** fed by connector confirmations
- Audit trail on every referral and appointment record (from day one)
- Analytics: funnel/leakage, shadow-calendar fidelity metric, backlog re-activation
- Closed-loop report stub to referring provider

### Explicitly OUT of MVP scope (documented so it is promoted at cutover, not rediscovered)
- AI writing/proposing directly onto the native calendar
- Native-side MA approval queue
- Bidirectional sync and conflict-precedence engine
- Epic / EHR write integration

> **Scope-creep guard:** "native calendar running in the background" means a **read-only mirror**, not a hidden full parallel operational system. The single biggest risk to this MVP is the shadow calendar quietly growing into the native product. Keep the mirror minimal.

---

## 3. Personas

| Persona | Role | Core need |
|---|---|---|
| **Maria** | Patient who received a referral | Clarity on why/cost, low effort, language respected, evening availability |
| **Denise** | Referral coordinator | Fewer manual calls, a trustworthy queue, visibility into what the AI said, easy override |
| **Priya** | Medical Assistant (commitment gate) | Fast worklist with full call context; nothing books without her; calendar at least as good as today's |
| **Ray** | Practice administrator (economic buyer) | Provable ROI, compliance assurance, low-risk on-ramp before any migration |
| **Dr. Allen** | Referring provider (secondary) | Closed-loop confirmation, no new login |

---

## 4. System architecture

### 4.1 Layers

- **Client layer** — staff console (web UI); patient-facing channels (voice call, SMS)
- **Application / API layer** — API gateway (auth, routing) fronting: outreach/cadence service, conversation service, scheduling-connector service, reporting/analytics service
- **Voice AI & telephony layer** — voice AI engine (STT / LLM dialog / TTS); telephony provider (outbound calls, SMS)
- **Data layer** — primary DB (referrals, appointments, audit trail); cache/job queue (cadence jobs); shadow native calendar store (one-way mirror)
- **External systems** — practice scheduling system (read in MVP); Epic/EHR (deferred to cutover)

### 4.2 Highest-risk component: the scheduling-connector service

It has two jobs that must stay **separate and independently testable**:

1. **Read path** — read availability from the practice scheduler. Their system is the source of truth; we never write to it.
2. **Mirror path** — write each MA-confirmed booking one-way into the shadow calendar store.

**Failure rule:** if the mirror write fails, the booking is still valid in the practice system and patient impact is zero. The only consequence is a flagged fidelity gap. The mirror is never in the critical path of a booking.

### 4.3 Runtime flow (single successful outbound call)

1. Cadence engine determines an attempt is due, fires a job.
2. Conversation service loads patient context + script (reads from data layer).
3. Voice AI engine drives the dialog (STT → LLM → TTS) over the telephony provider.
4. Telephony places the call. *(No answer → loop back to cadence engine for next attempt.)*
5. Patient accepts a slot; AI captures intent + slot with full transcript.
6. Connector surfaces the captured slot to the MA worklist; MA confirms it in the practice scheduler.
7. Confirmation writes to primary DB **and** mirrors one-way into the shadow calendar store.
8. Reporting service records the outcome; reminders/prep cadence begins.

---

## 5. Data model (core objects)

Two backbone objects. Build these first; everything else hangs off them.

### 5.1 Referral

| Field | Notes |
|---|---|
| `id` | |
| `patient` | name, demographics (age/sex), contact, preferred language |
| `insurance` | plan / network |
| `reason` | referral reason text |
| `referring_provider` | originating PCP/provider |
| `referral_time` | ingestion timestamp |
| `location` | target site |
| `priority` | normal / urgent (set at triage) |
| `state` | see 6.1 |
| `attempts[]` | ordered call/SMS attempt records |
| `audit[]` | immutable attribution log (who/what/when) |

### 5.2 Attempt (child of Referral)

| Field | Notes |
|---|---|
| `timestamp` | |
| `channel` | voice / sms |
| `outcome` | connected / voicemail / no_answer / declined / escalated |
| `duration` | for voice |
| `transcript` | full turn-by-turn text |
| `summary` | AI-generated summary of the call |
| `disclosure_played` | boolean (compliance) |
| `escalation` | reason + severity if raised |

### 5.3 Appointment

| Field | Notes |
|---|---|
| `id` | |
| `referral_id` | link back |
| `slot` | date / time / provider / location |
| `source_of_truth` | `practice_system` in MVP |
| `mirror_status` | `mirrored` / `pending` / `failed` (shadow calendar) |
| `audit[]` | who confirmed/changed it, when, what changed |

> The audit trail is a **core data-model requirement from day one**, even for the read-only mirror. It is the spine of the eventual native migration and the clinical-adjacent compliance posture. Do not add it later.

---

## 6. State machines

### 6.1 Referral state machine

| State | Trigger to enter | System behavior | Exit |
|---|---|---|---|
| `Ingested` | Referral arrives | Parse, validate phone, dedupe, triage urgency | Data complete → `Queued` |
| `Queued` | Validation passed | Schedule first outreach per cadence + urgency | Cadence start reached |
| `Outreach Active` | Cadence attempt fires | AI call → outcome logged → next step set | Slot accepted / declined / exhausted / escalated |
| `Slot Accepted` | Patient accepted a slot | MVP: intent surfaced to MA worklist | MA confirms → `Booked` |
| `Booked` | MA confirms in practice system | Mirror one-way into shadow calendar; reminder/prep cadence begins | Visit date passes |
| `Escalated` | Clinical / distress / complex flag | Route to human; pause automation | Human resolves → re-state |
| `Closed-Won` | Visit completed | Trigger closed-loop report | Terminal |
| `Closed-Lost` | Declined or cadence exhausted | Log reason; eligible for re-activation | Terminal (re-openable) |

### 6.2 Appointment handling — MVP (Connector + shadow mirror)

The AI **never commits a booking** in the MVP.

| Step | Where | Who |
|---|---|---|
| AI captures accepted slot | Call / text | AI |
| Booking entered & confirmed | Practice's existing system (source of truth) | MA |
| One-way mirror write | Shadow calendar store (read-only copy) | System |
| Change / cancel | Practice system; re-enters outreach instead of leaking | MA |

### 6.3 Appointment approval lifecycle — post-migration only (NOT built in MVP)

Documented so it is promoted at cutover. Native calendar becomes authoritative; every AI-created appointment is born `Pending` and is invisible as confirmed until an MA approves it (the keystone human-in-the-loop gate). Out of MVP scope.

---

## 7. Edge cases & safety rails

Healthcare voice products live or die on edge-case handling. Model these explicitly, not as exceptions.

| Scenario | Required behavior |
|---|---|
| Urgent / stat referral | Triage at ingestion; human-first / accelerated cadence; never wait in a slow loop |
| Patient in distress on call | Stop scheduling; empathetic handoff to human; flag immediately |
| Clinical questions | AI gives no medical advice; route to clinical staff |
| Explicit decline / opt-out | Honor immediately; suppress further contact; log; respect opt-out law |
| Repeated voicemail | Cap voice attempts; pivot to SMS; eventually surface to staff |
| Wrong number / not the patient | No PHI to non-patient; halt; alert staff to fix data |
| Voicemail PHI risk | Minimal-disclosure message: identify practice + callback only, no clinical detail |
| Language barrier | Detect/honor language preference; multilingual voice; human fallback |
| Cadence exhausted | Close-Lost with reason; eligible for future re-activation |
| Mirror write fails (MVP) | Booking still valid in practice system; mirror retries; fidelity metric flags the gap; zero patient impact |
| AI captures a wrong slot (MVP) | MA catches it at confirmation in their own system; nothing auto-commits |
| Sync conflict / double-book / approval backlog | **Post-migration only** — defined precedence rule, slot-hold on first proposal, SLA age-flag; never auto-confirm |

### Compliance (functional requirements, not footnotes)

Voice + healthcare + automated outbound dialing is among the most regulated combinations that exists. Assume, from day one: mandatory AI self-disclosure, consent + quiet-hour rules for automated outbound contact, immediate opt-out honoring, PHI-minimization on voicemail, full auditability, and appointment-change attribution. Validate specifics with qualified counsel before any live patient contact.

---

## 8. UI surface

Operational tool, not a marketing dashboard. Modeled on the supplied reference's disciplined density (many small purposeful cards, one accent color, generous whitespace). **The one rule:** every card on a daily-driver screen must answer "what do I do next?" or "is the AI working?" Rich visualization belongs only on the Analytics page.

### 8.1 Shared components (build once, reuse everywhere)
- Left sidebar nav (active highlight, settings pinned bottom) + top bar (search, practice selector, notification bell, user menu)
- **State pill** — renders any referral/call state in its consistent color; reused on every screen
- **Patient deep-link** — a patient name is clickable everywhere → Referral detail
- **Transcript panel** — AI summary on top, audio scrubber, turn-by-turn text
- **Metric card** — label, big number, delta vs. baseline, optional sparkline

### 8.2 Pages & build priority

| # | Page | User | Priority |
|---|---|---|---|
| 1 | Landing / sign-in | All | Light |
| 2 | Dashboard (home) — model on reference | MA / Coordinator | **Core** |
| 3 | Referral list | Coordinator / MA | **Core** |
| 4 | Referral detail view | All | **Core** |
| 5 | AI call log (Voice AI record) | MA / Coordinator | **Core** |
| 6 | Analytics dashboard | Administrator | **Core** |
| 7 | Urgent alerts / escalation queue | MA / Coordinator | High (trust/safety) |
| 8 | MA action queue (confirm slots) | MA | High (keystone flow) |
| 9 | Calendar | MA / Coordinator | Medium |
| 10 | Settings / configuration | Administrator | Medium (mostly static) |
| 11 | Referral ingestion / upload | Coordinator | Light |

### 8.3 Key screens (condensed; full layout/state/data spec in the UI Page Specification doc)

- **Dashboard** — urgent-alerts strip (loud, top, calm "all clear" if zero) → today's AI activity metric cards → "needs your action" queue → referral pipeline funnel → upcoming appointments peek.
- **Referral list** — full-width sortable/filterable table; columns: patient, demographics, language, insurance, reason, referring provider, referral time, location, state pill, priority, attempts, transcript link, transcript summary. Prominent "urgent only" toggle.
- **Referral detail** — two-column: patient/insurance + referral facts (left); state timeline + per-attempt transcript panels + next scheduled action with override controls (right).
- **AI call log** — filterable log (timestamp, patient, attempt #, channel, outcome pill, duration, summary, transcript link); row opens transcript panel; escalated calls flagged.
- **Analytics** — conversion funnel with lift vs. baseline, recovered-revenue KPI, backlog re-activation results, leakage by stage/source, **shadow-calendar fidelity gauge (visually separated — it is the migration-readiness signal, not an ROI number)**, compliance/audit snapshot.
- **Escalation queue** — high-contrast cards (reserved warm accent only here): reason, patient, transcript excerpt, single clear "I'm handling this" action.
- **MA action queue** — connector-mode keystone: per-card captured slot + inline transcript + confirm/edit/reject; confirmation writes state and mirrors to shadow calendar (subtle status, no MA action). Native approval flow is a labeled v2 placeholder only.

### 8.4 Cross-cutting UI rules
- One state-color system, applied identically on every screen (inconsistent state colors break trust instantly)
- Every list/card has explicit empty + loading states (show at least one empty state on purpose)
- Urgency color is reserved — appears only for escalations/alerts, never decorative; it must mean "a human is needed"
- Audit attribution visible on detail and call log even in the MVP

---

## 9. Build order

1. Referral state machine + Appointment record **with audit trail** (Section 5–6). Before anything else.
2. Referral ingestion (manual upload first) + validation/triage.
3. Cadence engine: configurable multi-attempt schedule with channel escalation.
4. Conversation flow: AI script with disclosure, objection branches, escalation triggers, accepted-slot capture.
5. Voice + SMS integration (telephony layer can be stubbed for early demos).
6. Connector mode: read-only availability adapter + MA accepted-slot worklist + mark-confirmed.
7. Native calendar (shadow): data model + one-way mirror writer. **NOT** AI-write, **NOT** native approval queue.
8. Analytics: funnel/leakage, shadow-calendar fidelity metric, backlog re-activation demo.
9. Closed-loop report stub for referring provider.

---

## 10. North-star acceptance test

> Can a skeptical practice administrator watch a single referral travel from *"one missed call, abandoned"* to *"AI reached the patient, captured a slot, MA confirmed it in our own system, completed visit, loop closed"* — and then see that same booking already sitting correctly in the shadow native calendar, proving migration is just a switch?

If yes, the MVP proves both the conversion loop **and** the migration thesis.

---

## 11. Open questions (resolve before/during build)

- **Calendar table-stakes scope:** which scheduling primitives (multi-resource, waitlists, recurring blocks) must the shadow mirror faithfully represent to be migration-credible?
- **Migration trigger:** what fidelity threshold / duration of correct shadow operation justifies flipping a practice to Native mode, and what is the conflict-precedence rule at that point?
- **Buyer & intake:** which referral intake (fax / EHR / referral platform) is the realistic first path?
- **Beachhead specialty:** cardiology, GI, ortho, or behavioral health? No-show economics and urgency differ sharply.
- **Conversion baseline:** current referral→completed-visit rate, to quantify lift.
- **Cadence policy:** concrete attempt schedule and the rules that stop the loop.
- **Compliance specifics:** jurisdiction-by-jurisdiction automated-call and AI-disclosure requirements, plus system-of-record audit obligations (with counsel).
- **Pricing model:** SaaS seats vs. outcomes-based per-converted-referral.

---

*End of PRODUCT_SPEC.md*
