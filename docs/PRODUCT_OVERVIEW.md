# PRODUCT_OVERVIEW.md

**Voice AI Referral Conversion Platform** — orientation for new contributors.

Read this first. It gives you the mental model in one page. For anything you actually build from — data model, state machines, edge cases, build order — go to **[PRODUCT_SPEC.md](./PRODUCT_SPEC.md)**, which is authoritative and wins on any disagreement.

---

## What it is

Specialist practices lose a large share of incoming referrals because a single unanswered phone call ends the practice's outreach — the patient isn't refusing care, the call just didn't connect. This product replaces that one attempt with a persistent, voice-led AI outreach engine: it calls patients on a smart cadence (with SMS fallback), resolves the actual reason they haven't booked, gets the appointment scheduled, and reports the outcome back to the referring provider.

It is **not** an auto-dialer. The long-term defensibility is owning the scheduling calendar, which turns an unbounded "integrate with every practice's scheduler" problem into one bounded "our calendar ↔ EHR" integration.

## The one thing you must not get wrong: scope

The product is **two modes that share one engine.** Know which one we are building.

- **Connector mode — this is the MVP. Build this.** The AI works against the practice's *existing* scheduling system. It captures the accepted slot; the MA confirms it in the system they already trust.
- **Native mode — the destination. NOT in the MVP. Do not build.** Our own calendar becomes the source of truth and the AI proposes appointments onto it for MA approval.

The MVP *does* build the native calendar — but only as a **silent one-way mirror**: confirmed bookings are copied into it, read-only, not authoritative. This proves the calendar can represent a real schedule and seeds a migration-ready dataset, so the future migration is a cutover, not a cold start — without taking on bidirectional sync (the hardest problem in the product) yet.

> **Scope-creep guard:** "native calendar in the background" means a read-only mirror, *not* a hidden parallel system. The biggest risk to this MVP is the shadow calendar quietly growing into the native product. When unsure whether something is in scope, the in/out table in **PRODUCT_SPEC.md §2** is the authority — not your judgment, not this doc.

## The moving parts

- **Outreach & conversation engine** — cadence scheduler + voice AI (speech-to-text → dialog → text-to-speech) + telephony, SMS fallback.
- **Scheduling connector** — the highest-risk component. Two *separate, independently testable* paths: (1) read availability from the practice scheduler (their system is truth, we never write to it); (2) write each confirmed booking one-way into the shadow calendar. If the mirror write fails, the booking is still valid and patient impact is zero — the mirror is never in a booking's critical path.
- **Shadow native calendar** — data model + one-way mirror writer only.
- **Staff console UI** — an operational tool (not a marketing dashboard); ~11 screens. Page detail lives in the UI Page Specification.
- **Data backbone** — two objects: the **Referral** (a state machine driving outreach) and the **Appointment** (a record with an audit trail). Build these first. The audit trail is required from day one, not later — it is the spine of the eventual migration and the compliance posture.

## How a referral flows (the short version)

Ingested → validated/triaged → persistent AI outreach (discloses it's an AI, resolves friction) → patient accepts a slot → MA confirms it in the practice system → mirrors one-way into the shadow calendar → reminders → visit completed → closed-loop report to the referring provider. A cancel re-enters outreach instead of leaking again.

Edge cases (urgent referrals, patient distress, clinical questions, opt-outs, wrong numbers, voicemail PHI) and compliance (AI self-disclosure, quiet hours, opt-out law, PHI minimization, full audit) are **functional requirements, not exceptions** — PRODUCT_SPEC.md §7.

## Where to go next

| To… | Read |
|---|---|
| Build anything (data model, states, edge cases, build order) | **PRODUCT_SPEC.md** — authoritative |
| Work on the UI | **UI Page Specification** |
| Understand end-to-end user journeys | **User Journey Document** |

Unresolved decisions that may affect your work (beachhead specialty, referral-intake path, cadence policy, migration trigger, pricing) are tracked in **PRODUCT_SPEC.md §11**.

---

*Intentionally one page. Depth lives in PRODUCT_SPEC.md.*
