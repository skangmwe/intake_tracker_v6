# SOLUTION REQUIREMENTS
> **For Claude:** Read this file at the start of every session for this project. Use all sections below as your primary context before taking any action. If a section is marked `[PENDING]`, ask the Analyst to complete it before proceeding.
>
> *This artifact is the Analyst's requirements deliverable for a solution — what should be built, for whom, and why. The canonical **build spec** (how it should be built) is a separate developer artifact at [`artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md`](../dev/ai_solutions_tracker_build_spec_final.md); this doc references it rather than duplicating it.*

---

## 1. SOLUTION IDENTITY

| Field | Details |
|---|---|
| **Solution Name** | AI Solutions Tracker |
| **Solution Tier** | `Tier 3` — Enterprise solution (all Enterprise solutions are Tier 3 by default per firm CLAUDE.md). Multi-workspace platform used firm-wide, three access levels + Platform admin grant, escalation bridge between workspaces, REST API and webhooks (R2), append-only audit trail, SSO. Developer leads from intake. |
| **Version** | v1.0 |
| **Status** | `Draft` |
| **Date Created** | 2026-07-03 |
| **Last Updated** | 2026-07-03 |
| **Analyst Owner** | [PENDING — name to be confirmed] |

**Tier Definitions (for Claude and Analysts):**
- **Tier 1** — Analyst-owned. Runs interactively in Claude Code. No system integrations. Human always present. No developer needed.
- **Tier 2** — Analyst builds the AI layer in Claude Code; Developer wraps infrastructure (scheduling, auth, UI, integrations). **MCP note:** if an approved platform MCP covers a required system integration, the Analyst calls it directly — the developer only builds what the MCP doesn't cover.
- **Tier 3** — Full development project. Complex UI, deep multi-system integration, multi-user scale, or building a new MCP server. Developer leads from the start. All Enterprise solutions are Tier 3 by default.

> **For Claude:** Read the Tier field before taking any design or build action. Tier 1 means the Analyst owns the full build — do not route work to a Developer. Tier 2 or 3 means include infrastructure handoff notes in any solution design you produce. If this field is blank or `[PENDING]`, treat the solution as Tier 2 and flag it.

---

## 2. REQUESTOR & STAKEHOLDERS

| Field | Details |
|---|---|
| **Requesting Group / Department** | AI Solutions team (Practice Groups & Client Solutions, Firm Operations, and Enterprise Solutions Analyst teams jointly) |
| **Primary Contact** | [PENDING — AI Solutions Lead to confirm] |
| **Executive Sponsor** | [PENDING — likely CIO / COO sponsor for firm-wide platform; to be confirmed] |
| **End Users** | Multi-audience: (1) AI Solutions Manager and Analysts across the three sub-teams; (2) Practice Group / Department members raising and triaging requests in their own workspaces; (3) approvers on gates (AI Solutions Manager, PG/Dept Lead, GCO, InfoSec); (4) Business Owners tracking their solutions; (5) firm-wide users consuming the read-only Feature Catalog dashboard |
| **Approximate User Count** | Firm-wide — every Practice Group / Department that stands up a workspace, plus the full AI Solutions team. Sized in the hundreds at launch, potentially firm-scale (thousands) as workspaces proliferate. Exact headcount is a deployment setting (§16 of the build spec) — [PENDING] |

---

## 3. THE REQUEST

### Problem Being Solved

The AI Solutions team receives requests from across the firm — Practice Groups, Firm Operations, and Enterprise stakeholders — but has no unified intake, triage, or delivery-tracking system. Requests arrive through email, ad-hoc forms, and hallway conversations; the team's delivery pipeline is tracked in scattered spreadsheets; and requestors cannot see what is happening to their request once it is escalated to the AI Solutions team. Practice Groups that run their own local triage before escalating have no shared vocabulary or handoff mechanism. Features that the team has already built are hard to discover, so teams re-build the same capability across matters. There is no audit trail suitable for an attorney-adjacent record. There is no leadership-facing view of throughput, cycle time, or backlog.

### Proposed Solution

A single-instance, multi-workspace tracker with:

- **A central AI Solutions workspace** that is both the delivery hub and the firm-wide reporting hub.
- **Practice Group / Department workspaces** cloned from a common template, where PGs raise and triage their own requests before escalation.
- **A one-time, one-way escalation bridge** that moves a request from a PG workspace into the AI Solutions workspace for delivery, locks the crossing fields on the PG side at the escalation snapshot, and mirrors AI-side delivery status back to the PG record through a platform-defined read-only `AI Solutions Status` field. This is the only structural linkage between workspaces; there is no second linked path.
- **A configurable lifecycle** (Intake → Discovery → Build → QA → Deploy → Post-launch, seeded AI-side only) with approval gates whose approver sets freeze at gate-open.
- **A Feature Catalog** — an inventory of reusable features harvested from shipped solutions, browsable firm-wide through a read-only dashboard.
- **A Toolkit** (Release 2) — one catalog of playbooks, plugins, and prompts.
- **Announcements**, delivered via an in-app bell, so team news lands from day one.
- **An append-only immutable audit trail**, captured off a single event spine that also drives notifications, the status mirror, and dashboards.
- **AI-assist as an optional overlay** (Release 2) — duplicate detection, link suggestions, drafting help, and reuse detection — always human-in-the-loop, permission-respecting, and off the critical path.

Authoritative build detail lives in [`artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md`](../dev/ai_solutions_tracker_build_spec_final.md) (1,052 lines). That document is the single source of truth for architecture, objects, fields, workflow, escalation semantics, permissions, reporting, and phasing; this section captures the *why*, not the *how*.

### User Workflow — Today vs. With the Solution

| Step | Today | With the Solution |
|---|---|---|
| 1 | A Practice Group user wants AI help; they email the AI Solutions Lead or fill an ad-hoc form. Requests scatter across inboxes and spreadsheets. | User submits a request in their own PG/Dept workspace with a structured intake form; the similar-requests nudge (§9.8) surfaces likely duplicates as they type. |
| 2 | PG-side triage is informal; the "same" request may be re-submitted by multiple people. | PG can triage locally (comment, link, close as duplicate, or escalate). Local Outcome closes PG-only work; escalation is the single path to AI-side delivery. |
| 3 | On escalation, the AI Solutions team re-keys the request into their own tracker; PG loses visibility. | The escalation bridge snapshots crossing fields into the AI workspace, adopts the shared ID, and locks the PG side. The PG sees delivery through the read-only `AI Solutions Status` mirror. |
| 4 | AI team's delivery lifecycle (Intake → Discovery → Build → QA → Deploy → Post-launch) is tracked in a spreadsheet with no gate enforcement, no audit trail, no linked artifacts. | Configurable lifecycle with approval gates (AND-join, named-individual or team slots), inline approve/reject, immutable activity thread, and typed links (`related`, `duplicate-of`, `re-pursuit-of`, `sourced-from`). |
| 5 | Reusable features from shipped solutions are undiscoverable. Teams re-build. | The Feature Catalog is populated by "Add to catalog" on a shipped Request; browsable firm-wide via the read-only Feature Catalog dashboard and (R2) the gallery view. |
| 6 | Leadership has no reliable view of throughput, cycle time, backlog, or who is loaded. | Three seeded dashboards in R1 Phase 2 (AI Solutions default, Workload, Feature Catalog) + a per-user Home surface. |
| 7 | Closure is informal; the trail rots. | Records close with a small, consistent Outcome enum (Live / Declined / Withdrawn / Duplicate) plus free-text Outcome Notes. Nothing is hard-deleted; the audit trail is append-only. |

### Solution Category

*Select all that apply.*

- [x] Workflow automation (routing, approvals, notifications)
- [x] Internal reporting
- [x] Data processing
- [ ] Document automation
- [ ] Research & analysis
- [ ] Client-facing output
- [ ] Q&A / Knowledge retrieval
- [x] Other: **Multi-workspace request-tracking platform with escalation bridge and reuse catalog**

---

## 4. DATA & INPUTS

### Input Sources

| Input | Format | Example |
|---|---|---|
| Request intake form (in-app) | Structured fields per §17 of build spec | Name, Description, Workflow Details, Requestor, Business Owner, Dept/PG/Client, Client/Matter numbers, Business Value 1–5, Efficiency Gain 1–5, Level of Effort 1–5, etc. |
| Attachments | Any common file type, ≤25 MB per file (deployment setting) | PDFs, screenshots, mockups, sample data, diagrams |
| CSV import (create-only) | CSV | Migration from prior tracker; each row mints a new record from the importing workspace's own prefix; Legacy ID field preserves the source-system identifier |
| SSO identity | SAML/OIDC claims from firm SSO | Every user reference (Assigned Analyst, Requestor, Business Owner, Watchers, approvers) resolves against SSO-provisioned identities |
| REST API (Release 2) | JSON over HTTP + webhooks | External integrations write to the same event spine and obey the same permissions |
| DMS / SharePoint connector (Release 2, Phase 4) | Connector-dependent | External documents linked (rather than uploaded) into the record |

### Data Schema

The canonical seed field schemas are defined in the build spec:

- **Request** — §17 (System/identity, Lifecycle/status, Intake, Value mapping, Solution details, Triage/classification, Build, Deploy/outcome, Post-launch value)
- **Feature Catalog** — §18
- **Toolkit** (Release 2) — §19
- **Announcement** — §20

This requirements doc does not restate them. The [S]/[A]/[P]/● tag rules for how fields cross the escalation bridge are in §17 of the build spec and are load-bearing for build.

### Data Sensitivity

- [ ] Public
- [ ] Internal Only
- [x] **Confidential** — Firm/client sensitive data
- [ ] Privileged
- [x] **PII Present** — Contains personally identifiable information (user references, SSO-resolved identities, Requestor/Business Owner names, comment content that may reference individuals)
- [ ] Regulated Data

**Rationale.** The tracker stores Client and Matter numbers (§3.5 build spec — required when `Dept/PG/Client = Client`), free-text request descriptions that reference client work, attachments that may include client-adjacent artifacts, and user PII throughout user-reference fields. It is not privileged by default, but it is client-adjacent and holds enough context that leakage between workspaces or outside the firm would matter. The build spec is explicit that comments are immutable "for an attorney-adjacent record" (§9.3). Treat all data as Confidential unless a specific record is upgraded by its content.

`[PENDING — confirm classification with IT and Legal/GCO before deployment. Confirm whether attachments containing privileged content are anticipated; if yes, upgrade handling and route through InfoSec review.]`

### Data Handling Notes

- **No hard delete, anywhere.** Records close (Outcome + reason); configuration retires. The append-only audit trail cannot have its history orphaned. Drafts (pre-record) are the sole exception. (§4.3, §9.7 build spec)
- **System fields are immutable to everyone**, including Platform admins. (§4.3)
- **Platform-defined fields are governed centrally** — only Platform admins may edit their definitions; `AI Solutions Status` has no manual write path at all. (§4.3, §6.4)
- **Cross-workspace field mappings are AI-side-confirmed.** A PG workspace has no authority to create fields in, or push unmapped data into, the AI Solutions workspace. (§4.3, §6.2)
- **Escalation is one-time and one-way.** There is no de-escalation; mistaken escalations are resolved by closing the AI-side record with a reason. (§6.6)
- **Every list, dashboard, view, search, and export resolves to the viewer's own entitlements at read time.** Presentation never widens access. (§10.2, §22)
- **PII in logs / telemetry** must follow `.claude/rules/dev/api-pii-handling.md`. The Entra `oid`/`sub` pseudonymous identifier is the only user identifier permitted in logs; email, display name, and Requestor names are never logged.

---

## 5. OUTPUTS & SUCCESS CRITERIA

### User Stories

| As a... | I want to... | So that... |
|---|---|---|
| **PG/Dept requestor** | submit a request in my own workspace and see progress after it is escalated to the AI Solutions team | I don't have to email the AI team and then wait blind |
| **PG/Dept admin** | triage requests locally (link duplicates, close what my team can handle, escalate the rest) | my group's queue stays clean and only genuine AI-team work crosses the bridge |
| **AI Solutions Analyst** | pick up escalated and AI-direct requests, work them through Intake → Post-launch, and see my load at a glance on the Home | I know what's mine, what needs me, and what changed since I last looked |
| **AI Solutions Manager** | see backlog by Origin, closure trend, unassigned count, and workload distribution across analysts | I can balance load, spot slippage, and report throughput |
| **Gate approver (Manager / PG Lead / GCO / InfoSec)** | receive an in-app sign-off request, review the record inline, and approve or reject with an optional comment | approvals are audited and live where the work lives — not in email |
| **Business Owner** | be notified on gate decisions, closure, and Benefit-review prompts against the solutions I sponsor | I stay in the loop without needing to chase status |
| **Watcher** (self-subscribed) | follow a record I don't own | I hear the same hold/gate/closure signals as the Requestor, minus sign-off requests |
| **Any firm user** | browse the read-only Feature Catalog dashboard | I can find out whether the AI team has already built the thing I'm about to ask for |
| **Platform admin** | manage platform-defined fields, the crossing map, workspace provisioning, and the firm-wide audit | firm-wide governance stays coherent as workspaces proliferate |

### Expected Output

The solution *is* the interface, not a produced document. Its output surfaces are:

| Output | Format | Destination |
|---|---|---|
| Records list per workspace | In-app filterable/sortable/searchable grid, columns driven by active saved view | Screen; CSV export of active view (access-respecting) |
| Record detail | In-app detail page: header + sticky lifecycle stepper + tabs (Fields / Tasks & gates / Activity) + side panel (typed links / attachments / watchers) | Screen |
| Bridge visualization (escalated records) | Three-part panel: PG snapshot → shared spine → live AI record | Screen |
| In-app notifications | Bell notification centre | Per-user, resolving to entitlements |
| Announcements | Pinned strip on Home + bell + browsable history | Audience-scoped |
| Three seeded dashboards (R1 Phase 2) | Fixed layouts built from an 8-widget palette | AI Solutions default, Workload, Feature Catalog (read-only firm-wide via Dashboard-viewer) |
| Home surface (R1 Phase 2) | Per-user landing: Needs your decision / Your work today / Since you were last here / New to triage / Pinned announcements / Your toolkit | Per-user |
| CSV export | CSV of the active saved view; columns and rows follow entitlements | Downloaded file |
| REST API + webhooks (Release 2) | JSON | External integrations |
| Immutable audit trail | Activity thread on each record; firm-wide audit log (Platform admin scope) | Screen + export |

### Testable Acceptance Criteria

| User Story (persona) | Criterion | How it will be tested |
|---|---|---|
| PG requestor | The `AI Solutions Status` field on the PG record is blank until escalation, then updates automatically on every AI-side hold change, gate decision, and closure. No PG user (admin included) can write to this field. | Automated integration test: escalate a record, drive it through hold/gate/closure events AI-side, assert the PG-side field value at each step; attempt writes at every access level and assert rejection. |
| PG requestor | Escalated fields on the PG record display the escalation-time snapshot and never mutate when the AI side edits its copy. | Integration test: after escalation, edit each [S] field AI-side; assert PG-side value is unchanged and lock icon persists. |
| PG admin | A copy action from an AI-closed record creates a fresh unlinked draft with content fields carried across (respecting the crossing map for cross-workspace copy), no outcome, no history, and an optional `related`/`re-pursuit-of` link back. | Integration test: close an AI-side record; copy back to originating PG; assert new record has fresh ID from the PG prefix, no outcome, empty audit trail, and (if selected) the correct typed link. |
| AI Analyst | Direct AI-workspace creation, escalation, and CSV import each mint an ID from the correct workspace's own prefix and next-sequence value; the counter never collides even under concurrent create + running CSV import. | Load test: run 10,000 concurrent in-app creates against a live import of 5,000 rows; assert all IDs are unique, sequential per prefix, and no gaps or collisions. |
| Gate approver | An open Approval Request's approver set is frozen at gate-open; a mid-flight edit to the gate definition governs only the next firing. A team slot is satisfied by any one member's sign-off; an AND-join requires every slot. Partial reject preserves standing approvals. | Integration test: open a gate with two named + one team slot; edit the gate definition; assert in-flight approvals resolve against the frozen snapshot. Test partial-reject loopback. |
| AI Analyst | Every meaningful state change emits exactly one event on the spine; all four consumers (audit, mirror, notifications, dashboards) read the same emission. No double-emit. | Instrumentation test: fire each state change; assert exactly one audit entry, one mirror update (if applicable), one notification fan-out (if applicable), and one dashboard-metric update. |
| Any viewer | No list, dashboard widget, search result, filter value, or export ever reveals a row or field the viewer's entitlements don't already grant. A hidden field cannot be surfaced by adding it as a column, filtering on it, or exporting it. | Access-matrix test: for each of Viewer / Member / Workspace admin / Platform admin / Dashboard-viewer, attempt to surface out-of-scope data through every mechanism; assert 100% denial. |
| Any user | No record is ever hard-deleted. Attempted deletion at any access level (including Platform admin) returns denied; records close only via terminal Outcome + reason. | Security test: attempt hard-delete via UI, API, and direct data path (once R2 API ships); assert all denied. |
| Platform admin | The append-only audit trail captures field changes (old → new, who, when), lifecycle transitions, gate decisions (with actual signer + slot context), proxy sign-offs (flagged), configuration changes (including Platform-admin edits to platform-defined fields), and escalation events. No admin can rewrite or delete a past entry. | Integration test: perform each event type; assert audit entry shape and immutability. |
| AI Solutions Manager | The AI Solutions default dashboard, Workload dashboard, and Feature Catalog dashboard render in Phase 2 with the widget sets specified in §10.3, §10.3.1, §10.3.2 respectively; each widget resolves to the viewer's entitlements. | UAT test: render each dashboard at each access level; assert widget set, drill-through behaviour (full dashboard only), and access-scoping. |
| Any user | Saved views store presentation only and never widen access; a Dashboard-viewer bound to one shared view sees only its columns as their field-level boundary, enforced identically on list, filter, search, and export. | Access-matrix test: for a Dashboard-viewer, attempt to add columns / filter on / search for / export fields outside the bound view; assert all denied. |
| Any user | WCAG 2.2 Level AA conformance across all surfaces, in light and dark theme, at every supported viewport (320px → 1920px+). | Automated axe + Playwright accessibility suite per `.claude/rules/design/accessibility.md` and `.claude/rules/dev/web-testing.md`; manual VoiceOver / NVDA smoke test of primary flows. |
| Ops | Every list surface (Requests, Feature Catalog, Toolkit, Tasks-in-Home, audit log) scrolls inside itself; app chrome, page header, view bar, column header row, and pagination footer stay visible during vertical *and* horizontal scroll. | Playwright test at each supported viewport; assert sticky-region visibility during scroll of a long/wide list. |

**Additional criteria to confirm before build:**

- `[PENDING — quantitative SLA targets. The build spec is explicit that Timing (§17.3) is a requestor urgency signal, not a commitment, and that there are no per-tier target durations. Set the "due soon" window (§16) at deployment; confirm whether any hard SLA is expected against Due Date and, if so, from whom.]`
- `[PENDING — target scale for reporting (concurrent users, rows per workspace, escalations per quarter). Drives capacity sizing per firm CLAUDE.md default of 500 concurrent users unless overridden.]`

### Use Cases

**Use Case 1: PG-to-AI escalation (the primary bridge flow)**
- **Trigger:** A PG member has an in-progress Request in their workspace that has crossed the local triage threshold and needs the AI Solutions team.
- **Main flow:** (1) PG member opens the record and initiates Escalate. (2) System prompts to commit pending edits to crossing fields (nothing silently discarded). (3) Confirm-and-lock: snapshot crossing fields, adopt PG ID on a new AI-workspace record at stage Intake, lock crossing fields on the PG side, open the status mirror, notify the seeded `AI Intake` user group. (4) AI Intake analyst picks up from the "New to triage" panel on their Home (or the Unassigned tile on the default dashboard) and assigns themselves; the "assigned to you" notification fires only after triage. (5) Delivery runs Intake → Discovery → Build → QA → Deploy → Post-launch on the AI side; the PG side sees the coarse mirror (Deploy and Post-launch collapse to "Deployed" per §3.4).
- **Alternative flow:** A required crossing field is unpopulated → escalation blocks at confirm-and-lock with a validation error; user completes the field, retries.
- **Exception:** The PG record has already been escalated once (one-time, one-way, §6.6) → escalate action is disabled with an explanation; if the practice group wants to re-open a closed AI-side record, they use Copy (§5) to start a fresh unlinked request.

**Use Case 2: Approval gate with team-only slots, AND-join, and rejection-with-re-review**
- **Trigger:** A stage transition (e.g., Build → QA) fires a gate configured with three approver slots — each identifying a **team / role label** (e.g., AI Solutions Manager, GCO, InfoSec), not a named individual. Slot configuration is edited on S31 Lifecycle & gates; team membership is edited in the same admin surface's Approver teams section.
- **Main flow:** (1) Gate opens; the team-slot set freezes to a snapshot; each slot renders on the record's Tasks & gates tab as "team + N eligible + 'Select your name…' dropdown." Members of the eligible team are notified in-app. (2) A GCO team member opens the record, picks their name from the dropdown; Approve and Reject buttons appear. (3) They approve with optional comment; the slot records "Approved · [signer] · [time]." (4) Manager and InfoSec team members do the same for their slots. (5) All three slots satisfied; the stage transitions.
- **Alternative flow:** InfoSec rejects — this **requires a comment** (the Reject button is disabled until both a name is selected and a comment is entered). The slot then shows "Changes requested · [signer] · [time]" plus the comment, and a **fresh re-review row** appears beneath it — a different team member can select their name, add a comment, and approve or reject again. The gate stays "Changes requested" (pale-orange chip on the gate header) and continues to appear in the Home's "Needs your decision" queue until someone approves. Manager and GCO approvals stand across the rejection cycle.
- **Exception:** A team member with a pending sign-off deactivates before selecting their name and approving → deactivation is not blocked (the slot is a team, not an individual — any other eligible member can still sign). If the slot has been resolved by a named person (approved or rejected) and that named person then deactivates, the recorded signer stays on the record for audit; deactivation is not blocked because the sign-off has already resolved.

**Use Case 3: Feature reuse via the catalog**
- **Trigger:** A new Request lands in the AI Solutions workspace.
- **Main flow:** (1) The intake similar-requests nudge (§9.8) surfaces up to three keyword-matched existing Requests. (2) Analyst also browses the Feature Catalog dashboard (or the R2 gallery view) to check for a reusable feature. (3) Analyst adds a `related` typed link from the new Request to the matched Feature (or in R2, the AI-assisted reuse-detection check proposes it). (4) During Build, the analyst reuses the feature per its How-to-reuse notes.
- **Alternative flow:** After Build, the analyst harvests something reusable from this Request via the "Add to catalog" affordance — a Feature Catalog draft is prefilled from the Request, the analyst writes the one-liner and how-to-reuse notes, submits, and the system stamps a `sourced-from` link back to the source Request.
- **Exception:** The matched feature is marked Deprecated → it is filtered out of the default view; the analyst can still find it in a "show deprecated" saved view but is warned before linking.

**Use Case 4: Closure with Copy back to PG**
- **Trigger:** AI Solutions team decides not to build a request (Outcome = Declined) or ships it (Outcome = Shipped — live).
- **Main flow:** (1) Analyst closes the AI-side record with the Outcome and Outcome Notes. (2) Closure event notifies Requestor + Business Owner + Watchers; the notification rides the closure event across the bridge. (3) `AI Solutions Status` on the PG record updates to reflect the terminal Outcome; the PG record's own lifecycle stays live and PG-controlled (§6.5).
- **Alternative flow:** PG wants to iterate on a Declined request → uses Copy (§5) to spawn a fresh PG-workspace draft, edits, submits as a new request (fresh ID, no bridge, optional `re-pursuit-of` link to the closed record).
- **Exception:** PG never re-opens the closed record — closed IDs are never reused or re-minted (§6.7); re-pursuit is always a fresh record.

**Use Case 5: Migration via CSV import**
- **Trigger:** Firm has existing tracker data to migrate at go-live.
- **Main flow:** (1) Platform admin loads a CSV into a target workspace. (2) Each row mints a new record from that workspace's prefix and sequence (no target IDs from the CSV); source identifier maps to `Legacy ID`. (3) Requestor resolves per row from SSO; unresolved rows fall back to the importing admin with a validation-report flag (§13). (4) Load runs; per-row validation report separates valid landings from flagged rows. (5) No per-record notifications fire during import; live notifications resume for actions taken after.
- **Alternative flow:** A row has a Requestor value that doesn't resolve to a current SSO user → row lands with Requestor = importing admin and a warning in the report; admin re-maps after load if desired.
- **Exception:** A row fails schema validation (e.g., invalid `Business Value` outside 1–5) → row is returned in the flagged set, does not land, and can be corrected and re-imported.

### What "Good Output" Looks Like

The build spec is itself the "good output" reference — 1,052 lines of executable design — and the prototype (`artifacts/docs/design/project/AI Solutions Tracker.dc.html`) is the visual truth for the seven prototyped screens. In addition:

- **Visual fidelity to the McDermott design system.** Every surface builds on `.claude/rules/design/_core-requirements.md` and its companions (McDermott lockup, navy + pale + accent, 2px or pill radius, `--accent-interactive` for interactive accents, theme-stable foreground on pale/alert fills, WCAG 2.2 AA floor).
- **The list surface (§22 of the build spec)** is the day-to-day working surface and must exhibit: in-list scroll (chrome and column headers stay put), aging tint driven by SLA Status, distinct empty states for zero-data vs filtered-to-zero, per-column funnel filters with type-aware inputs, a two-layer saved-view model, drag-resizable columns with a flexible last column, long-text wrap to three lines, multi-select rendering as first-two-pills + "+N", and an Export view button in the view bar.
- **The record detail** (§23 of the build spec, reconciled against the prototype) must show: the sticky compact lifecycle stepper; a meta strip carrying Display Status, Assigned Analyst, Priority Score, Due Date, and **Submitted** (Origin lives in the "Escalated · [origin]" status pill in the header for escalated records only); three tabs **Intake / Tasks & gates / Activity** (Intake is editable form controls with an autosave indicator on the tab row); tasks grouped by build phase with collapsible headers on navy; a tabbed task composer (Add task / Add bundle) in a gray-boxed panel; per-task typed structured fields (URL / Text / Number / Date / Select / Checkbox) drawn from the workspace's field library; per-task Notes & decisions expandable field; gates rendered inline within their target phase group with AND-join; and a side panel with **Relationships / Attachments / Watchers**.
- **Escalated records surface bridge provenance inline**, not through a standalone three-part visualization. The header carries an "Escalated · [origin]" status pill; the Intake tab shows a slim mirror note (shared ID · crossed fields locked on PG · PG follows via status mirror · Deploy/Post-launch → "Deployed" on PG until closure); each crossing field carries a pale-gold "⇄ Crossed · locked on PG" marker (fully editable AI-side; the lock is conceptual and applies on the PG side only). This was the prototype's resolution of the highest-uncertainty design decision.
- **Tone.** No exclamation marks. Verb + noun buttons. Sentence-case headlines. No "Oops!" or "Just" in errors. Follow `.claude/rules/design/ux-copy-and-microcopy.md`.

---

## 6. CONSTRAINTS & BOUNDARIES

### What the Solution Should NOT Do

- **Never hard-delete a record.** Every record closes via terminal Outcome + reason; configuration retires. Drafts are the sole exception (pre-record). (Build spec §4.3, §9.7)
- **Never allow a second linked path between workspaces.** Escalation — with its bundle of shared ID + field lock + status mirror — is the only linkage. Direct create, CSV import, and typed links never form a bridge. (§6.1)
- **Never de-escalate.** Mistaken escalations resolve via Outcome closure + Copy back to the originating workspace. (§6.6)
- **Never widen access through presentation.** Saved views, dashboards, filters, search, and exports store presentation only; every read resolves to the viewer's own entitlements. Tab visibility is convenience, not security. (§10.2, §21, §22)
- **Never permit a manual write to `AI Solutions Status`.** It is written solely by the bridge off the event spine, at every access level, including Platform admin. (§6.4)
- **Never auto-execute AI actions.** The AI-assist layer (Release 2) is human-in-the-loop, permission-respecting, transparent, and off the critical path. (§14)
- **Never expose an out-of-scope record via "not found."** An unauthorized read returns a no-access response, never 404 — the platform never reveals the existence of a record outside the viewer's entitlements. (§22.6)
- **Never log user content, AI responses, document content, or direct PII.** Only the pseudonymous Entra `sub`/`oid` identifier is permitted in logs. (`api-logging.md`, `api-pii-handling.md`)
- **Never introduce backwards-compatibility shims** or feature flags for scenarios that don't yet exist. Build what the current release ships and no more. (Firm CLAUDE.md convention.)
- **Never gate a design-system component on visual conformance without token discipline.** Raw colors and off-spec radii are blocking findings; use McDermott tokens. (`.claude/rules/design/_core-requirements.md`)

### Technical Constraints

- **SSO only.** No local authentication path.
- **Modern evergreen browsers**, responsive web (light + dark themes). No native mobile app. (§16)
- **Uploads ≤25 MB per file**, common file types (default; admin-adjustable per §16).
- **Every list surface obeys the in-list scroll rule** (§22.1) — app chrome and column headers stay visible during vertical and horizontal scroll.
- **No horizontal page scroll at any viewport.** Wide content scrolls within its own container. (`.claude/rules/design/responsive-and-mobile.md`)
- **Web stack:** React 19, TypeScript 5, webpack 5, Node 24 (per `web/CLAUDE.md`).
- **API stack:** ASP.NET Core, EF Core, Azure services (per `api/CLAUDE.md`); Managed Identity for Azure resources; secrets in Azure Key Vault only.
- **Database:** Azure SQL, stored procedures for anything beyond single-table CRUD; append-only audit tables with soft-delete for regular records (per `database/CLAUDE.md`).
- **CSP:** default strict; `/swagger/*` only gets a relaxed policy (per `api-performance.md`).
- **Every response sets explicit `Cache-Control` headers** to prevent AFD edge cache from serving cross-user data (per `api-coding-standards.md`).
- **Feature Catalog and Toolkit read-only firm-wide sharing** must never bridge or copy data across workspaces at read time — it is a Dashboard-viewer surface, not federation. (§10.5)

### Approved Integrations for This Solution

- **Entra ID (SSO)** — the only identity provider.
- **Azure Key Vault** — secrets only; loaded at startup via `DefaultAzureCredential`.
- **Azure Blob Storage** — attachments (files follow the record; not governed by the crossing map).
- **Azure SQL** — primary datastore.
- **Azure Service Bus** — event spine transport (per `api-worker.md`).
- **Application Insights** — logs, metrics, traces (both API and web).
- **Azure Front Door** — edge ingress; validated in-process via `X-Azure-FDID` header per `api-auth.md`.
- **DMS / SharePoint connector (Release 2, Phase 4)** — specific system choice deferred to that phase (§16).

**Not approved for this solution** (or not yet scoped): Anthropic / OpenAI LLM providers (AI-assist layer is Release 2 Phase 4 and requires its own scoping), email delivery (Release 2 Phase 3), any external intake form or third-party integration not listed above.

`[PENDING — Anthropic / OpenAI provider selection for Release 2 Phase 4 AI-assist layer. Follow api-llm-auth.md: default Claude via official Anthropic SDK; alt OpenAI via official OpenAI SDK; embeddings (if AI-assist needs them) on Azure OpenAI DataZoneStandard via Managed Identity. Confirm at Phase 4 kickoff.]`

---

## 7. USERS, ADMINISTRATION & REPORTING

### Reporting & Analytics

| Report / View | Audience | Frequency | Form | Exportable? |
|---|---|---|---|---|
| Records list per workspace | Members, admins | On-demand | Screen | CSV of active view (access-respecting) |
| AI Solutions default dashboard (R1 Phase 2) | AI Solutions team | On-demand | Screen, fixed layout | Records-grid widget exports CSV |
| AI Solutions Workload dashboard (R1 Phase 2) | AI Solutions Manager + Analysts | On-demand | Screen, fixed layout | Records-grid widget exports CSV |
| Feature Catalog dashboard (R1 Phase 2) | Firm-wide, read-only | On-demand | Screen (Dashboard-viewer surface) | Records-grid widget exports CSV |
| PG/Dept template starter dashboard (R1 Phase 2) | PG/Dept admin + members | On-demand | Screen, fixed layout, workspace-local | Records-grid widget exports CSV |
| Home surface (R1 Phase 2) | Every user | On sign-in | Screen, per-user | N/A |
| Announcement history | Every user | On-demand | Screen (browsable list + bell + pinned strip) | N/A |
| Immutable audit thread on each record | Anyone who can see the record | On-demand | Screen | N/A |
| Firm-wide audit log | Platform admin only | On-demand | Screen | Export per §12 |
| Workspace-scoped audit log | Workspace admin | On-demand | Screen | Export per §12 |
| Cycle-time / time-in-stage / throughput / time-to-first-triage metrics (R1 Phase 2) | AI Solutions Manager | On-demand | Dashboard widgets (line, histogram, KPI-with-trend) | Records-grid widget exports CSV |
| No-code dashboard builder (Release 2 Phase 3) | Workspace admin | On-demand | Screen | N/A |
| REST API + webhooks (Release 2 Phase 3) | External integrations | Real-time | JSON | N/A |

Cross-workspace visibility is **never** achieved by a dashboard reading another workspace's fields — a PG user who needs AI Solutions data is granted Viewer access to an AI Solutions dashboard via the Dashboard-viewer surface (§10.4).

### User Management & Access

| Item | Details |
|---|---|
| **User types / roles** | Three fixed per-workspace access levels: **Viewer** (read-only), **Member** (add/edit/close in own workspace), **Workspace admin** (all Member rights + local configure). Plus the **Platform admin** grant — additive, firm-wide, held by a small deployment-configured set of people. Plus the **Dashboard-viewer** — a Viewer whose only surface is one bound dashboard. |
| **Access restrictions** | Every workspace enforces its own three-level model; Platform admin grants firm-wide rights only for platform-defined-field schema, the cross-workspace crossing map, access provisioning, and the full audit. **Four permission floors override the level model:** no hard delete anywhere; system fields immutable to everyone; platform-defined fields governed centrally; cross-workspace mappings AI-side-confirmed. (§4.3) |
| **Add / remove process** | SSO handles identity. A workspace admin manages membership within their workspace; a Platform admin manages firm-wide access provisioning. On deactivation, an account with a pending individual sign-off cannot be deactivated until it is reassigned or resolved (§6.8 safety floor). Open owned or assigned records do not block deactivation; they become orphaned references, and notifications to the deactivated account are suppressed. |
| **Activity log** | Every edit, lifecycle transition, gate decision (with signer + slot context), configuration change, and escalation event is captured in the immutable append-only audit trail from day one. Surfaces two ways: the activity thread on each record (visible to anyone who can see the record) and the admin-scoped audit log (workspace-scoped for a workspace admin; firm-wide for a Platform admin). (§12) |

### Administration & Operations

| Item | Details |
|---|---|
| **Owner / maintainer** | AI Solutions Lead owns the AI Solutions workspace; each PG/Dept workspace admin owns their own workspace. Platform admin(s) own the platform-defined layer. Development team owns the code, infrastructure, and deployment pipeline. `[PENDING — named individuals per role.]` |
| **Admin-configurable settings** | **Workspace admin:** local fields, per-workspace lifecycle and gates, saved views and dashboards, user membership, workspace-scoped audit read, manage announcements, run CSV import / export. **Platform admin:** platform field schema, crossing map (R1 Phase 1 read-only seed → R1 Phase 2 admin-editable), workspace provisioning (out-of-band in Phase 1 → in-app self-serve in Phase 2), role-label catalog, firm-wide audit. **Deployment settings (§16):** SLA "due soon" window, Benefit-review offset (seed 90 days), upload limits, fiscal year — admin-adjustable, no code change. |
| **Failure handling** | Append-only audit captures every event. Sign-off requests deliver via bell; the safety floor in §6.8 prevents dead-account sign-offs. Import validation returns per-row report (create-only; live records never touched). Every list, dashboard, and search resolves to viewer entitlements — a permission drift surfaces as a "no-access" response, never a leak. Runtime errors: bubble to the API's global exception middleware, logged with OperationId, response is ProblemDetails with a plain-language `detail` (never a stack trace to the user) per `api-error-handling.md`. |
| **Operational reports** | Application Insights for logs / metrics / traces (both API and web). Frontend error boundaries call `appInsights.trackException()`. Deploy-time recovery per `web-deploy-recovery.md` (build identifier baked into bundle; stale-bundle detection). `[PENDING — operational dashboard and alerting thresholds for pre-production hardening; scope with Development at scaffold time.]` |

---

## 8. ROLES & HANDOFFS

| Role | Responsibility for This Solution |
|---|---|
| **AI Solutions Analyst** | This is unusual — the AI Solutions Lead / Analyst team is the primary requestor **and** end user. The Analyst maintains this template and coordinates with Development throughout the multi-release build. Also owns the seeded rules content (role labels, saved views, dashboards) that goes into the deployed platform. |
| **UI/UX Designer** | **Yes** — extensive UI work across many surfaces (list, detail, dashboards, Home, intake form, escalation-bridge panel, admin surfaces). The design blueprint / prototype pipeline (`.claude/rules/design/README.md` → `/design-foundation` → Claude Design prototype → `/design-code-handoff`) applies. Designer refines the prototype after intake; Development builds against the reconciled blueprint. |
| **Developer** | Leads from intake (Tier 3). Owns architecture, all three areas (`web/`, `api/`, `database/`), the multi-release phasing per §15 of the build spec, and the deployment pipeline. Follows every `.claude/rules/dev/*` rule; runs `/dev-review-and-remediate` per slice; ships via `/dev-ship`. |
| **QA** | Test plan derived directly from this doc's Section 5 acceptance criteria + the build spec's floors. Includes: hallucination testing on AI-assist (R2 Phase 4), prompt injection checks, permission-floor tests, access-matrix tests across all five level combinations, cycle-time / time-in-stage derivation tests, dashboard drill-through tests, WCAG 2.2 AA conformance, cross-browser (Chrome/Edge on Windows; Safari/Chrome/Edge on macOS per `web-browser-support.md`), load tests for concurrent create + running import (ID minting invariant), and end-to-end escalation-bridge integrity. |
| **Requestor / Business Owner** | UAT sign-off before each release goes live. Primary UAT audience: AI Solutions Lead, plus one representative from each pilot Practice Group. |
| **IT / DevOps** | Manages `APPROVED-INTEGRATIONS.md` and the deployment pipeline. Provisions Azure resources (Key Vault, SQL, Blob, Service Bus, App Insights, Front Door). Grants Managed Identity roles per `api-secrets.md` at first deploy. |
| **Legal / GCO / InfoSec** | Confirms the Confidential classification (see Section 4). Reviews and signs off on the gates using GCO and InfoSec role labels in the AI Solutions lifecycle. |

---

## 9. APPROVALS REQUIRED

| Approval Type | Required? | Approver | Status |
|---|---|---|---|
| IT / Security Review | [x] Yes | IT + InfoSec | `Pending` |
| Data Privacy Review | [x] Yes | GCO / Legal | `Pending` |
| Practice Group Sign-off | [x] Yes | Pilot PG leads (subset TBD) | `Pending` |
| Legal / Compliance | [x] Yes | GCO / Legal | `Pending` |
| Executive Sponsor | [x] Yes | [PENDING — CIO / COO TBD] | `Pending` |
| AI Solutions Lead sign-off | [x] Yes | AI Solutions Lead | `Pending` |
| Development architecture review | [x] Yes | Dev Manager + Architect | `Pending` (per `/dev-build-architecture` review gate) |
| Design review | [x] Yes | UI/UX Designer + AI Solutions Lead | `Pending` (per `/design-code-handoff` flow) |

---

## 10. TIMELINE

The build spec (§15) sets a two-release plan:

- **Release 1 (MVP)** = Phase 1 (working loop) + Phase 2 (workspace usability). Ships the seed workspaces, escalation bridge, lifecycle and gates, Feature Catalog (searchable list Phase 1; dashboard + gallery Phase 2), Announcement object (Phase 1), three seeded dashboards (Phase 2), Home surface (Phase 2), admin-editable crossing map (Phase 2), current-date/date-difference primitive (Phase 2), SLA Status (Phase 2), advanced views (Phase 2), self-serve workspace provisioning (Phase 2), CSV import/export (Phase 1), in-app notifications (Phase 1), audit capture (Phase 1).
- **Release 2** = Phase 3 (Toolkit object build, no-code dashboard builder, request templates in full, email + digests, time-based triggers, REST API + webhooks) + Phase 4 (AI-assist layer, DMS/SharePoint connector).

| Milestone | Target Date | Owner | Status |
|---|---|---|---|
| Requirements finalized | 2026-07-03 | Analyst | Complete (this doc) |
| Design foundation (`/design-foundation`) | [PENDING] | UI/UX Designer | Not started |
| Design prototype in Claude Design | [PENDING] | UI/UX Designer + Analyst | Not started |
| Design–code handoff (`/design-code-handoff`) | [PENDING] | UI/UX Designer + Developer | Not started |
| Development architecture (`/dev-build-architecture`) | [PENDING] | Developer | Not started |
| Development scaffold (`/dev-build-scaffold`) | [PENDING] | Developer | Not started |
| Release 1 Phase 1 build complete | [PENDING] | Developer | Not started |
| Release 1 Phase 1 QA complete | [PENDING] | QA | Not started |
| Release 1 Phase 1 UAT / Business review | [PENDING] | Requestor | Not started |
| Release 1 Phase 1 deployment (dev tenant) | [PENDING] | Developer / DevOps | Not started |
| Release 1 Phase 2 build complete | [PENDING] | Developer | Not started |
| Release 1 (MVP) production go-live | [PENDING] | Developer / DevOps | Not started |
| Release 2 Phase 3 build complete | [PENDING] | Developer | Not started |
| Release 2 Phase 4 build complete | [PENDING] | Developer | Not started |

`[PENDING — hard dates against every milestone. Owner: AI Solutions Lead + Dev Manager. Sequence Phase 2 with the current-date/date-difference primitive first per §15, since SLA Status, live time-in-stage, Aging-in-stage, and any "Overdue" rule all depend on it.]`

---

## 11. INSTRUCTIONS FOR CLAUDE

*This section is written directly to Claude. Follow these instructions every time you work on this solution.*

1. **Always read this entire template plus the [`build spec`](../dev/ai_solutions_tracker_build_spec_final.md) before taking any action.** The build spec is the single source of truth for objects, fields, workflow, escalation, permissions, reporting, and phasing. Do not paraphrase it; cite section numbers when referencing it.
2. **If any required field above is blank or marked `[PENDING]`, flag it before proceeding.** In particular: the sensitivity confirmation (§4), quantitative SLA targets (§5), target scale (§5), timeline dates (§10), and named approvers (§9) all need Analyst follow-up before their respective downstream phases start.
3. **Treat all data in this project as `Confidential`** unless a specific record is upgraded by its content. Never log user content, AI responses (Release 2), document content, or direct PII. The only user identifier permitted in logs is the pseudonymous Entra `sub`/`oid`.
4. **Primary end-user audiences are:** (1) AI Solutions team (internal); (2) PG/Dept members (internal); (3) firm-wide read-only Feature Catalog viewers (internal). No external clients. Calibrate copy to firm-internal + partner-facing (Audience Level B) unless specifically writing content for a client-facing screen — there are none in the current scope.
5. **When in doubt about scope, refer back to Section 3 (The Request) and Section 6 (Constraints), then the build spec.** The build spec's floors — no hard delete, no second linked path, escalation is one-time and one-way, no manual write to `AI Solutions Status`, no widening of access through presentation — are absolute.
6. **Do not deviate from the approved integrations listed in Section 6.** New integrations require IT sign-off and an update to this section.
7. **Tier 3 — Development leads from intake.** The Analyst is a coordinator and end-user here, not the builder. Follow the northstar pipeline (`/plan` → `/build` → `/ship`) per `.claude/rules/dev/_core-requirements.md`. Use the design pipeline (`/design-foundation` → Claude Design prototype → `/design-code-handoff`) per `.claude/rules/design/README.md`.
8. **Every gate in `.claude/rules/dev/_core-requirements.md` and `.claude/rules/design/_core-requirements.md` is binding.** Enforced-not-advised includes: design-handoff detection, design-conformance token scan (raw hex, off-spec radii are blockers), design-fidelity render + compare when a handoff is present, and every applicable Pre-Implementation Checklist tier in the dev rules.
9. **This is a multi-release build.** Do not build Release 2 capabilities into Release 1. In particular: no REST API + webhooks, no time-based triggers, no AI-assist, no DMS connector, no email delivery in Release 1. **The Toolkit build, the no-code dashboard builder, and the full request-template feature were pulled forward into Release 1 (Phase 2) on 2026-07-07 — see the build spec §15 and the Change Log below.** The Announcement object ships in Phase 1.
10. **The build spec at [`artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md`](../dev/ai_solutions_tracker_build_spec_final.md) governs every implementation choice.** Where this doc and the build spec appear to disagree, the build spec wins (as with the design pipeline's prototype-vs-blueprint rule); update this doc if the requirement has actually changed.

---

## 12. CHANGE LOG

| Date | Changed By | Section(s) Affected | What Changed & Why |
|---|---|---|---|
| 2026-07-07 | Development (design session) | Build spec §2, §2.6, §9.7, §10.2, §10.5, §15, §19, §21; Requirements #9 | **Re-phased Release 1/2.** Pulled the "light trio" — no-code dashboard builder (§10.2), full request templates (§9.7), and the Toolkit build (§2.6, §19) — from Release 2 into Release 1 (Phase 2), on requester authorization. New cut line: R1 = everything a user does inside the app manually; R2 = automation / external reach / AI (email + digests, time-based triggers, REST API + webhooks, AI-assist, DMS connector). Resolved the self-serve-provisioning §15-vs-§21 inconsistency to R1 (Phase 2). Design: `artifacts/docs/dev/design/2026-07-07-r1-rephasing-and-dashboard-view-widgets-design.md`. The paired dashboard view-widgets rework + Requests-list toggle removal are a separate coordinated migration, planned separately. |
| 2026-07-03 | AI Solutions Analyst (via `/product-requirements-gathering`) | All | Initial requirements captured. The Analyst supplied [`ai_solutions_tracker_build_spec_final.md`](../dev/ai_solutions_tracker_build_spec_final.md) (1,052 lines) as the structured request. This doc captures the product-level requirements (why, who, what outcome matters, sensitivity, constraints, tier, timeline, approvals) and references the build spec as the authoritative "how." |
| 2026-07-03 | AI Solutions Analyst (via `/product-requirements-gathering`) | Section 1 | **Solution Tier set to Tier 3.** Rationale: multi-workspace enterprise platform used firm-wide, with three access levels + Platform admin grant, escalation bridge, REST API and webhooks (R2), append-only audit trail, SSO. All Enterprise solutions are Tier 3 by default per firm CLAUDE.md convention. The skill's stricter Tier 3 test (2+ of external clients / new MCP / custom auth / 3+ system integrations) would arguably land the MVP at Tier 2, but the Enterprise-by-default convention and the sheer scope of a multi-workspace platform with a formal escalation bridge push firmly to Tier 3. Confirm at architecture review. |
| 2026-07-03 | AI Solutions Analyst (via `/product-requirements-gathering`) | Section 4 | Sensitivity classified as **Confidential + PII Present**. Rationale: Client and Matter numbers are structured fields (§17.3 of build spec); free-text descriptions and attachments are client-adjacent; user references are firm PII throughout. Not privileged by default, but attorney-adjacent enough that leakage would matter. Flagged `[PENDING — IT/Legal confirmation before deployment]`. |
| 2026-07-03 | `/design-code-handoff` | Section 5 (Good Output; Use Case 2) | Updated alongside design-code-handoff on 2026-07-03. Reconciled the record-detail description against the approved prototype at `artifacts/docs/design/project/AI Solutions Tracker.dc.html`: tab structure is **Intake / Tasks & gates / Activity** (Intake is editable form controls, replacing the "Fields" tab from the build spec); the escalation-bridge panel is replaced by inline crossed-field markers + a slim mirror note in the Intake tab + an "Escalated · [origin]" status pill in the header; side panel is **Relationships / Attachments / Watchers** (renamed from "Typed links"); meta strip shows Submitted date (Origin lives in the status pill for escalated records). Added: per-task typed structured fields (URL / Text / Number / Date / Select / Checkbox) drawn from a workspace-managed field library, task bundle templates, per-task Notes & decisions. **Rewrote Use Case 2** to reflect the prototype's team-only approver-slot model with the "Select your name" dropdown per pending slot, and the rejection-requires-comment + re-review-row + Re-request-approval interaction. `[PENDING — reconcile team-only slot model with build spec §7.2 at architecture review; the build spec currently allows both team and named-individual slots.]` |

---

*Template Version: 1.0 | Maintained by: AI Solutions Analyst*
