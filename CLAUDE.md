# CLAUDE.md — Relay (Referral Conversion Platform Prototype)

This is a **multi-screen operational web app prototype** ("Relay"), built frontend-only against mock data. A reference implementation of the design (real JSX) is provided as a guide. It is not a landing page and not a production system. Read PRODUCT_OVERVIEW.md for the mental model and PRODUCT_SPEC.md for authoritative detail.

---

## Scope guardrails — read before writing any code

These prevent the most expensive mistakes. They override any instinct to "build the obvious next thing."

- **Connector mode only.** The MA confirms bookings; the platform surfaces AI-captured slots, call records, and analytics. **Do NOT build native mode**: no AI-writes-to-calendar, no native approval queue, no bidirectional sync. If a screen would imply native mode, render it as a clearly-labeled disabled/"v2" placeholder.
- **The shadow calendar is a read-only mirror.** The Calendar screen displays confirmed bookings. It does not create or edit appointments.
- **When unsure if something is in scope**, the in/out table in PRODUCT_SPEC.md §2 is the authority — not your judgment, not this file.

## Backend: not in this phase, but it is coming — build the seam for it

This is **phase 1: a frontend prototype against mock data.** Do **not** build a backend, real API calls, auth, or a database now — it would add scope and fragility to a UI prototype.

**However, a backend IS planned for phase 2** (to connect the voice AI and real scheduling). The prototype must be built so that future backend is a *substitution behind a stable interface*, not a teardown. Therefore:

- **All data access goes through one data layer/module** (`mockData.js` plus a thin accessor it feeds). Components never import raw data or hold inline fixtures — they call the data layer.
- **Shape the accessor like a future API**: functions such as `getReferrals()`, `getCallLog()`, `confirmSlot(id)` — async is fine and encouraged even though they resolve from mock data today. Phase 2 swaps their internals for real calls; component code should not have to change.
- **Mutations go through the data layer too** (e.g. `confirmSlot`), updating local state now, ready to become a real request later.
- Keep this seam clean and singular. The whole point is that "fix each page and connect the backend later" is a substitution, not a refactor.

Net: behave as if there is no backend, but architect as if one arrives next.

## Architecture rules — these enable the "iterate after one-shot" plan

- **One mock-data module + one accessor layer.** Every screen reads/writes through it. No inline/hardcoded data in components, ever. This is the phase-2 swap point.
- **One screen per file.** Each screen is its own component/file so pages can be fixed independently. Do not collapse the app into one file.
- **Stub interactions visibly.** Buttons that would need a backend call the data-layer mutation, update local state, and show a clear "(prototype)" affordance — never silently do nothing, never fake success as if real. **Especially the Confirm action on the confirm queue:** it must visibly move the item to a confirmed state and read as a prototype action, not imply a real write to a practice system.

## Always do first
- **Invoke the `frontend-design` skill** before writing any frontend code, every session, no exceptions.
- **Read the provided reference JSX first** and inventory its design language (see below) before generating anything.
- Read the **UI Page Specification** for per-screen layout/components/states, and **REFERRAL_STATUSES.md** for state definitions.

## The provided JSX is a guide — stay in its design language, but you may improve it

You are given the **actual JSX implementation** of the reference design (the same design the screenshot shows — use the code, not the picture). Treat it as the **visual and structural starting point and the source of the design language**, not a frozen spec.

**You MAY re-derive, refactor, or improve** components and patterns where it makes the app more functional, more usable, or higher quality — better state handling, cleaner props, accessibility, more complete interactions, sensible component decomposition. This is encouraged, not just allowed.

**The one thing you must preserve is coherence.** "You may improve it" must not become "every screen invents its own look." Whatever you change, the whole app must still read as **one coherent system descended from the reference**: same design tokens, same visual language, same shell, same state-pill treatment, same card/spacing rhythm.

**Step 1 — inventory the reference JSX:** its color tokens (primary teal accent, neutrals, the full referral-state color set), spacing/radii/shadow treatment, type family/weights, the shell (sidebar + topbar), the state pill + color map, card and list patterns, and its stack/conventions. Take these from the code.

**Step 2 — build the whole app in that language:**
- Carry the reference's tokens and shell across every screen so it feels unified.
- Reuse existing components where they already do the job; improve or generalize them rather than forking a divergent second version.
- For screens the reference does not cover, derive them from the same tokens and patterns so they belong to the same system; improve freely within that language.
- Improvements should raise quality/function while keeping the visual system consistent — not introduce a new or competing aesthetic.

**Two-tier urgency (from the reference — preserve the distinction):** a *soft amber* "needs a human / pending" affordance is distinct from the red *Escalated* state. Different signals; keep both; neither decorative. Canonical state names/colors: REFERRAL_STATUSES.md, mirrored in `mockData.js`.

## Local server
- **Always serve on localhost** — never screenshot a `file:///` URL.
- Start the dev server: `node serve.mjs` (serves project root at `http://localhost:3000`). It lives in the project root; start it in the background before screenshots. If already running, don't start a second instance.

## Screenshot workflow — consistency check, not pixel-matching

You have the reference *code* and may improve it, so screenshots verify that every screen is **coherent with the rest of the app and the reference's design language** — not that it pixel-matches an image.

- Puppeteer is at `C:/Users/nateh/AppData/Local/Temp/puppeteer-test/`. Chrome cache at `C:/Users/nateh/.cache/puppeteer/`.
- **Always screenshot from localhost:** `node screenshot.mjs http://localhost:3000` (optional label: `... http://localhost:3000 label`). Saves to `./temporary screenshots/screenshot-N.png`, auto-incremented.
- Screenshot **each screen**, navigating each route. Read the PNG with the Read tool and analyze it.
- Compare for *system coherence*: do the shell, state pills, card padding, type scale, and color usage match across screens and the reference language? Be specific: "Slot accepted pill differs from the reference color", "card padding 16px here vs 24px elsewhere".
- At least 2 comparison rounds. Stop when the app is internally coherent in the reference's language, or the user says so.

## Output defaults
- **Multi-file structure**: one screen per file, shared components, single `mockData.js` + accessor layer. Not one inline file.
- Follow the reference JSX's stack and Tailwind setup; do not run a second styling approach alongside it. Tokens defined once and reused.
- Placeholder images only where no real asset exists: `https://placehold.co/WIDTHxHEIGHT`.
- **Desktop-first**: a staff console used on desktop. Make desktop excellent; degrade gracefully. Not mobile-first.

## Brand assets
- Check `brand_assets/` for logos/palette/images. If anything there conflicts with the reference JSX, the **reference JSX wins** as the design language source.

## Hard rules
- Do NOT build a backend, real APIs, or auth now — but DO route all data through the swappable accessor layer so phase 2 is a substitution, not a refactor.
- Do NOT hardcode data in components — everything via the data layer fed by `mockData.js`.
- Do NOT put the app in one file — one screen per file, iterable independently.
- Do NOT let improvements fracture the design — the app must stay one coherent system in the reference's language.
- Do NOT fork a divergent second copy of an existing component — improve/generalize the shared one.
- Do NOT recolor/rename a referral state per screen, and do NOT collapse the two-tier urgency (amber "needs a human" vs. red "Escalated").
- Do NOT use `transition-all` or raw default Tailwind blue/indigo as the primary color.
- Do NOT stop after one screenshot pass, or screenshot only one screen.

---

*Design language source (improvable): the provided reference JSX. Product detail: PRODUCT_SPEC.md. Screen-by-screen: UI Page Specification. State definitions: REFERRAL_STATUSES.md. Seed data: mockData.js. Backend is phase 2 — build the seam, not the backend.*
