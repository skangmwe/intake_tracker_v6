# slice-record-status-hold-2dc91d5 — design-fidelity findings

**Handoff:** PRESENT (`artifacts/docs/design/project/`, focal `AI Solutions Tracker.dc.html`).
**In-scope prototyped screens (populated App-route in blueprint):** S2 `/requests` (RequestsListPage), S4 `/requests/:recordId` (RecordDetailPage) — the screens this slice changes (S2 row pill, S4 Status/Watchers tabs) — plus other populated-route prototyped screens. S5 (escalated) App-route is blank → out-of-scope non-blocking.

## Iteration 1 — status: OPEN (`#render-failed` precondition — stack not stood up)

The gate requires standing the built app up locally (per `/dev-local-testing`) and headless-rendering each in-scope screen against the prototype with per-component `hover`/`focus-visible`/`active` capture + computed-style diff, delegated to a fresh sub-agent, then manifest validation.

**Feasibility mapped; one hard environment constraint blocks an unattended run:**
- ✅ LocalDB `MSSQLLocalDB` present (stopped, startable); Chrome + Edge present (render hooks can run); `node_modules` installed; `Microsoft.Data.SqlClient.dll` in the API build output; `DevBypassAuthentication.cs` already exists; `ServiceBusPublisher` runs no-op when the namespace is unset (won't block boot).
- ❌ **No `sqlcmd` and no migration-runner tool** anywhere on the machine, and the API's `net10.0` `Microsoft.Data.SqlClient` **cannot be loaded into Windows PowerShell 5.1** (.NET Framework runtime mismatch). Applying the **62 migrations + 140 stored procedures** to a fresh LocalDB therefore requires **building a small .NET migration-applier tool first**. There is no `appsettings.Development.json` yet either.

**Remaining work to complete the gate (a large, multi-step operation):** build the migration applier → create `IntakeTrackerDev` + apply 62 migrations + 140 procs + seed records so screens render populated → write `appsettings.Development.json` + enable the DevBypass → boot API + web dev server (MSAL skip) → serve the prototype bundle over http → spawn a fresh adversarial sub-agent to render/enumerate/state-capture/compare S2, S4 (+ other in-scope screens) on both sides → build & validate the evidence manifest (`verify-design-fidelity-manifest.mjs`) → tear the stack down.

**Per `design-fidelity-web.md#render-failed`: the gate never skips to a pass on a stack it could not render.** Status is OPEN; the clean-run cache is not written.

## Iteration 2 — status: OPEN (stack stood up; default-state render/compare done; per-component manifest UNOBTAINABLE for this prototype format)

The full local stack was stood up and the render/compare **was run** this iteration (the iteration-1 blocker is cleared):

- **Stand-up:** built a .NET SQL applier (scratchpad tooling, never committed) → created `AiSolutionsTrackerDev` on LocalDB `MSSQLLocalDB` + applied all **62 migrations + 140 procs (0 failures)**; the migration seeds already populate 3 workspaces, 9 requests (LIT-9001…9006), and the DevBypass user's memberships → screens render populated. API booted on :5080 (Development env, `Auth__DevBypass__Enabled=true`, dev connection string via env vars — no committed `appsettings.Development.json`); web dev server on :5173 (dev-auth, proxy → :5080); prototype served over http on :8099. All verified reachable; stack torn down after the comparison.
- **Blocker fixed to make S4 renderable:** `GET /requests/{id}` was returning **500 for every non-escalated record** (`usp_GetBridgeForRecord` early-`RETURN` → no result set → EF `FromSqlRaw<BridgeRow>` "required column 'AiFieldValues' not present"). Fixed the proc to always emit the `BridgeRow` column shape (0 rows via a final-`SELECT` `WHERE` guard). Verified: LIT-9001/9002 now 200; escalated LIT-9004/9006 still 200 with the bridge block intact. See `remediations-applied` Iteration 2. **This is a pre-existing, cross-slice CRITICAL bug the stand-up surfaced for the first time.**
- **Adversarial sub-agent** (fresh, isolated) ran the render/compare against the running stack per the brief.

### Scope (in-scope prototyped screens = populated App-route in the blueprint master table)
S2 `/requests`, S3 `/requests/new`, S4 `/requests/:recordId`, S31 `/admin/lifecycle`. All other prototyped screens have a **blank App-route → out-of-scope, non-blocking** (`not-implemented` future-slice) per `design-fidelity-web.md` § Scope.

### Tooling limitation → `#render-failed` on the mandated per-component evidence (NOT a skip)
The prototype (`artifacts/docs/design/project/AI Solutions Tracker.html`) is a **Claude Design DCLogic single-file SPA** (template runtime in `support.js`; click-driven screen switching; **no hash/deep-link**). Two mandated mechanisms are **incompatible** with this format:
- `enumerate-prototype-components.mjs` returns **`COMPONENTS: 0`** on the prototype (it recognizes the build's `data-ds` attributes but not the prototype's inline-styled DCLogic markup) → the mandated prototype↔build **(type, ordinal)** matching + per-component **computed-style diff** cannot be produced.
- `render-states.mjs` renders a URL and cannot click-navigate → **prototype-side `:hover`/`:focus-visible`/`:active` captures are unobtainable** for the non-home screens.

Therefore a **validator-passing evidence manifest (`verify-design-fidelity-manifest.mjs`) cannot be produced** for this prototype — `enumerated_components` is empty and prototype-side `components[]` state captures/computed reads are absent. Per `design-fidelity-web.md#render-failed`, the gate does **not** skip to a pass. **`.last-clean-run.json` is NOT written.** (Build-side enumeration works — 28 `data-ds` components; build-side forced states + computed reads were captured — so the incompatibility is specifically the prototype half.)

### Default-state render/compare — findings (both sides rendered; concrete drift). Match-key: `design-fidelity/<route>::<screen>/<dimension>`
Shots under scratchpad `df/` (not committed). All rows below rendered BOTH sides.

**S2 `/requests` — ⚠ Drift**
- `design-fidelity//requests::S2/view-toolbar` — build shows a `Table · Board · Timeline · Agenda` segmented control in the toolbar; prototype does not. **added-element.** (Med confidence — may be a later-slice affordance; verify against intended design.)
- `design-fidelity//requests::S2/status-hold-pill` — build renders a per-row `StatusHoldPill` (this slice's change, `RequestsListPage.tsx:238`) when `statusHold ≠ InProgress`; the served prototype's Requests row template has no status/hold pill slot. **added-element (latent** — all seeded rows are `InProgress`, so neither default render paints it). **Slice-relevant — confirm the prototype's held-row treatment.**
- `design-fidelity//requests::S2/stage-casing` — prototype Title-cases stage cells ("Intake"); build lowercases ("post-launch","qa"). **visual-drift** (least-confident — different records).

**S3 `/requests/new` — ⚠ Drift** — field order (build leads with lifecycle/"Request type"; prototype leads Name→Description→Lifecycle), labels ("Request type" vs "Lifecycle", "Name" vs "Request name"), added Workflow Details / Business Owner, missing Dept/PG/Client in the intake section. Medium confidence — intake fields may be schema/config-driven.

**S4 `/requests/:recordId` — ⚠ Drift (heaviest; slice's core screen — verified by orchestrator against `df/s4-*-status-full.png`)**
- `…S4/tab-order` — prototype `Status · Intake · Tasks & gates · Attachments · Activity · Watchers & alerts`; build swaps to `… Attachments · Tasks & gates …`. **visual-drift.**
- `…S4/status-section-headers` — prototype uses **dark-navy section-header pills with icons** (STATUS / SLA / STATUS HISTORY & REACTIVATION TRAIL / RELATIONSHIPS); build uses plain bold labels + pale-blue pills. **visual-drift.**
- `…S4/status-meta-row` — prototype Status tab has a `SUBMITTED · LIFECYCLE · STATUS CATEGORY` meta row; build absent. **missing-element.**
- `…S4/status-sla-block` — prototype Status tab shows the SLA block (On track · Due …); build absent from the Status tab. **missing-element.**
- `…S4/status-history-trail` — prototype Status tab shows "STATUS HISTORY & REACTIVATION TRAIL" ("No status changes yet…"); build absent. **missing-element.**
- `…S4/status-control` — prototype: label "STATUS OVERRIDE", filled-accent inline UPDATE STATUS, "Current — Active"; build: label "Status", outlined UPDATE STATUS below, no "Current —". **visual-drift.** (This is the slice's tri-state control.)
- `…S4/status-extra-cards` — build Status tab surfaces Stage/MOVE STAGE + ESCALATE + CLOSE RECORD cards the prototype Status tab does not show. **added-element ×3** (may be an intentional consolidation — needs reconciliation).
- `…S4/watchers-notify` (**slice's change**) — prototype "Watchers & alerts": dark-navy section pills, an ACTIVE ALERTS section, and a "NOTIFY WATCHERS ABOUT" block with **5 always-visible** preference toggles; build: pale pills, "NOTIFY ME ABOUT", and toggles **gated behind "start watching this record"** (not visible for an unwatched record). **visual-drift / missing-element / content-drift.**

**S31 `/admin/lifecycle` — ⚠ Drift** — build adds a Workspace selector + "Saved" autosave chip; lifecycle picker is a card-tile vs the prototype's `<select>`; missing "WORKSPACE SETTINGS" eyebrow; sub-nav label "Manage announcements" vs "Announcements". The STAGES + GATES editors **match**. Not a slice screen.

**SHELL — ⚠ Drift** — sidebar lockup/nav/collapse + top-bar controls **match**; the top-bar **leaf title** shows the section name in the build ("Requests" on the detail/new-request routes, "Workspace" on lifecycle) vs the current **screen** name in the prototype ("Request detail", "New request", "Lifecycle & gates"). **visual-drift** (`app-shell-and-headers.md` — leaf should be the current page).

**APP — ✓ Match** — Georgia headings + sans tables, navy+pale+accent, teal sidebar-active (measured `rgb(0,226,193)` + 3px rail), 2px radii, spacing rhythm consistent. (Focus-ring parity on the prototype side unverified — same prototype-state tooling limit.)

### Disposition (why OPEN, and what the drift means)
- The served prototype **does** contain the status-hold model (grep of the focal HTML: `On hold`/`Abandoned`/`In progress`/`reactivate` all present), so the S4 drift is **genuine build-vs-prototype divergence, not a stale-prototype artifact**.
- Much of the S4 structural drift (Stage/Escalate/Close card placement, section styling, SLA/history blocks) predates this slice (record detail was built in slices 5/9/21). The **slice-introduced** surfaces that drift are the **S4 Status control** and the **Watchers & alerts** tab, plus the **S2 held-row pill**. These need a **developer design-reconciliation decision** (fix-to-prototype vs accept-as-intended-reconciliation) — recorded, not auto-applied, and carried to the architectural ledger.

**Status: OPEN.** Two independent blockers: (1) the per-component computed-diff manifest is unobtainable for this DCLogic prototype format (`#render-failed`), and (2) confirmed default-state visual drift on S2/S3/S4/S31 (S4 + Watchers are slice-relevant) awaiting reconciliation. `.last-clean-run.json` not written.

### Reconciliation (post-audit — each slice-relevant drift grounded in `26-slice-status-hold.md` + the served prototype)
Verified each slice-relevant divergence against the slice's design doc. Outcome: **the slice's own surfaces are faithful to the RECONCILED design; the served prototype export predates this iteration** — so they are `Accepted`, not defects. See the ledger (`architectural-findings.md`).
- **Watchers "Notify me about" + toggles gated on watching** → intended per-user preference model (slice-26 D4: sparse prefs keyed on `UserId`; line 42: "gated on isWatching"). "Me" is more accurate than the prototype's earlier "Notify watchers about". **Accepted.**
- **S2 held-row `StatusHoldPill`** → intended (line 42: "wired on S2 rows (Name cell)"); latent for all-InProgress seed. **Accepted.**
- **S4 Status control** → type matches (build `<Select>` ≈ prototype `<select>`; doc's "segmented control" wording is imprecise). **Accepted.**
- **Blueprint S4 confirms** "a record Status/hold model and per-record alert preferences emerged during iteration" — the served prototype has the core Status-tab tri-state but NOT the S2 pill or the per-user "me" framing, consistent with a pre-iteration export.

**Remaining (NOT slice-26 blockers, tracked in `deferred-architectural.md`):**
- Cross-slice record-detail structure drift (section-pill colour, Status-tab meta/SLA/history blocks, tab order, unbuilt "Active alerts" feed) — built in slices 5/9/21.
- Systemic: the DCLogic-prototype design-fidelity tooling gap (blocks the manifest for every slice).
- Environment: tSQLt not vendored.

**Net for slice 26:** no code changes required on the slice's own surfaces (they follow the reconciled design). The gate cannot mechanically reach CLEAN here (manifest unobtainable for the prototype format + tSQLt unrunnable) — those are systemic/environment limitations, not slice-26 defects. Recommend: re-export the prototype so future audits compare against the current design; ticket the DCLogic tooling gap + tSQLt/CI.

## Iteration 3 — reconciled TO the prototype (user: "prototype should win" — prototype is CURRENT, not stale)

Correction to Iteration 2's disposition: the user confirmed the served prototype is up to date, so the slice-relevant drift is **real deviation** (build showed what the design doesn't), not a stale-export artifact. Reconciled the build to the prototype and flipped the three ledger entries `Accepted` → `Applied` (details in `remediations-applied` Iteration 3):

- **S4 Watchers** (`WatchersCard.tsx`) — "Notify me about" → **"Notify watchers about"**; toggles **ungated** (always visible); **"Active alerts"** section added. Full-stack ungate (new `usp_GetMyWatcherPreferences` + `MyPreferences` on the DTO/shared type) so a non-watcher's prefs read/persist. `visual-drift`/`missing-element`/`content-drift` → resolved.
- **S2 Requests list** (`RequestsListPage.tsx`) — per-row `StatusHoldPill` **removed** (prototype list has no row pill). `added-element` → resolved.
- **S4 Status control** (`RecordDetailPage.tsx`) — relabelled **"Status override"**. `visual-drift` → resolved.

Verified: API 577/577, web 1149/1149, live non-watcher `myPreferences` read, Requests-list re-render (no pill). **Still deferred (not slice-26):** cross-slice record-detail structure drift (dark-vs-pale section pills, Status-tab meta/SLA/history blocks, tab order — slices 5/9/21); the DCLogic-prototype tooling gap; tSQLt not runnable. `.last-clean-run.json` still not written (manifest unobtainable for this prototype format).
