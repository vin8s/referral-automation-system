# REFERRAL_STATUSES.md

The referral state machine is the spine of the product. **Every screen must render states through the one shared state-pill component using exactly these names and colors.** Never rename or recolor a state per screen. Colors are taken from the Relay design baseline.

Authoritative behavior detail lives in PRODUCT_SPEC.md §6. This file is the quick reference for the UI build.

## States

| State | Meaning | Pill color (from baseline) | Suggested token |
|---|---|---|---|
| `Queued` | Ingested and validated; first outreach scheduled, not yet attempted | Blue / indigo | `state-queued` |
| `In Progress` | Active multi-attempt cadence running (calls + SMS) | Slate-blue | `state-outreach` |
| `Pending Confirmation` | Patient accepted a time on a call; awaiting MA confirmation | Amber / tan (soft) | `state-slot-accepted` |
| `Booked` | MA confirmed it in the practice system; mirrored to shadow calendar | Teal (the primary accent) | `state-booked` |
| `Escalated` | Pulled out of automation; a human is needed (distress, clinical, bad data) | Red / coral | `state-escalated` |

## Call Outcome States 
| Call Outcome | Meaning | Suggested Color | CSS Token |
|---|---|---|---|
| `No Answer` | Call rang but patient did not answer | Gray / muted slate | `call-no-answer` |
| `Voicemail Left` | Voicemail successfully delivered to patient | Light gray-blue | `call-voicemail-left` |
| `Call Back Requested` | Patient requested outreach at another time | Soft blue | `call-callback-requested` |
| `Identity Verified` | HIPAA verification completed successfully | Indigo | `call-identity-verified` |
| `Interested` | Patient expressed willingness to schedule appointment | Sky blue | `call-interested` |
| `Appointment Accepted` | Patient verbally accepted proposed appointment slot | Amber / soft gold | `call-appointment-accepted` |
| `Booked` | Appointment fully confirmed and entered into scheduling system | Teal | `call-booked` |
| `Transferred to Staff` | Patient handed off to live scheduler or office staff | Purple | `call-transferred` |
| `Declined Referral` | Patient declined scheduling or no longer interested | Neutral brown / muted orange | `call-declined` |
| `Wrong Number` | Phone number invalid or reached incorrect individual | Dark gray | `call-wrong-number` |
| `Language Barrier` | Patient speaks unsupported language or interpreter needed | Orange | `call-language-barrier` |
| `Disconnected` | Call dropped before completion | Muted red-gray | `call-disconnected` |
| `Escalated` | AI unable to safely continue; human intervention required | Coral / red | `call-escalated` |


## Allowed transitions

```
Queued        → Outreach
Outreach      → Slot accepted | Escalated |
Slot accepted → Booked | Escalated | Outreach        (rejected slot re-enters outreach)
Booked        → Outreach (cancel re-enters outreach, never silently lost)
Escalated     → (back to prior state once a human resolves it)
```

## Rules the UI must respect

- **Two-tier urgency is separate from state.** The soft *amber* "needs a human / pending" affordance (escalation banner, confirm-queue pending pill) is **not** the same as the red `Escalated` state pill. Keep both; never merge their colors.
- `Slot accepted` is the connector-mode handoff: it means the AI captured a slot and it is waiting in the MA confirm queue. It is **not** "booked." Only an MA confirm moves it to `Booked`.
- A cancel from `Booked` returns the referral to `Outreach`
- Priority (`normal` / `urgent`) is a separate attribute, not a state. An urgent referral can be in any active state and should be visually flagged independently of its state pill.

---
*Color hexes: sample from the design baseline screenshot. State behavior: PRODUCT_SPEC.md §6.*
