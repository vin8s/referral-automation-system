# REFERRAL_STATUSES.md

The referral state machine is the spine of the product. **Every screen must render states through the one shared state-pill component using exactly these names and colors.** Never rename or recolor a state per screen. Colors are taken from the Relay design baseline.

Authoritative behavior detail lives in PRODUCT_SPEC.md §6. This file is the quick reference for the UI build.

## States

| State | Meaning | Pill color (from baseline) | Suggested token |
|---|---|---|---|
| `Queued` | Ingested and validated; first outreach scheduled, not yet attempted | Blue / indigo | `state-queued` |
| `Outreach` | Active multi-attempt cadence running (calls + SMS) | Slate-blue | `state-outreach` |
| `Slot accepted` | Patient accepted a time on a call; awaiting MA confirmation | Amber / tan (soft) | `state-slot-accepted` |
| `Booked` | MA confirmed it in the practice system; mirrored to shadow calendar | Teal (the primary accent) | `state-booked` |
| `Escalated` | Pulled out of automation; a human is needed (distress, clinical, bad data) | Red / coral | `state-escalated` |
| `Closed-won` | Visit completed; loop closed to referring provider | Green | `state-closed-won` |
| `Closed-lost` | Declined or cadence exhausted; eligible for re-activation later | Neutral / gray | `state-closed-lost` |

## Allowed transitions

```
Queued        → Outreach
Outreach      → Slot accepted | Escalated | Closed-lost
Slot accepted → Booked | Escalated | Outreach        (rejected slot re-enters outreach)
Booked        → Closed-won | Outreach                (cancel re-enters outreach, never silently lost)
Escalated     → (back to prior state once a human resolves it)
Closed-lost   → Queued                               (re-activation campaign; terminal but re-openable)
Closed-won    → (terminal)
```

## Rules the UI must respect

- **Two-tier urgency is separate from state.** The soft *amber* "needs a human / pending" affordance (escalation banner, confirm-queue pending pill) is **not** the same as the red `Escalated` state pill. Keep both; never merge their colors.
- `Slot accepted` is the connector-mode handoff: it means the AI captured a slot and it is waiting in the MA confirm queue. It is **not** "booked." Only an MA confirm moves it to `Booked`.
- A cancel from `Booked` returns the referral to `Outreach` — it is re-engaged, never dropped to `Closed-lost` silently.
- `Closed-lost` is terminal but re-openable (re-activation), so the UI should allow a "re-activate" affordance on those rows.
- Priority (`normal` / `urgent`) is a separate attribute, not a state. An urgent referral can be in any active state and should be visually flagged independently of its state pill.

---
*Color hexes: sample from the design baseline screenshot. State behavior: PRODUCT_SPEC.md §6.*
