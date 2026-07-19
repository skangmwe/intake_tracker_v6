# Slice Plan — AI Solutions Tracker

*The locked contract for build cadence. Ships Release 1 (Phase 1 + Phase 2) as one coherent plan. Release 2 (Phase 3 + Phase 4) is scoped separately in the build spec (§15) and is out of scope here.*

## Ceiling and target

- **Target slice count:** ~~24~~ **29 slices** for R1 (Phase 1 = 20, Phase 2 = 4, **v2 reconciliation = 5**). The build spec ships ~17 top-level user capabilities across Phase 1 + Phase 2 (see requirements Section 5); with the v2 codified concepts (object-level Relationships, Status/hold, multi-lifecycle, multi-dashboard composer, Toolkit) the target lands at ~1.7× — still within the 1–3× guidance from `slicing.md`. **Original target 24 raised to 29 per the [v2 reconciliation addendum](v2-reconciliation.md) — architecture-doc update accompanies this raise.**
- **Reviewable LoC ceiling per slice: 6,000 lines.** Reasoning: this is a Tier 3 enterprise application (identity + multi-workspace + audit + escalation + gates). Security-critical concerns argue for lower; greenfield CRUD argues for higher. 6,000 balances the two. Foundation + admin + escalation slices are expected to run near the ceiling; edge-states + edge-admin slices sit around 1,500–2,500.
- **Drift cap:** _slice count cannot grow by more than 25% during Step 3 without an architecture-doc update and a re-review._ 25% of 29 → 36 slices max under drift; anything above triggers a re-review.

## Design-handoff coverage

Every in-scope screen in [`full-design-blueprint.md`](../../design/full-design-blueprint.md) is reachable from a slice. **After the 2026-07-16 v2 reconciliation**, prototyped screens are **S1, S2, S3, S4, S5, S6, S9, S10, S11, S23, S28, S29, S30, S31, S32, S33, S34, S35, S36, S38, S39, S43** — tagged `[prototyped]`; deferred screens are tagged `[deferred]` and are built from the blueprint's per-screen spec. The **S43 Toolkit** (new object) is covered by Slice 29.

No screen is silently dropped. Every out-of-scope screen is called out at the bottom.

## Slice-order dependencies

Foundation (1) → Auth & shell (2) → Fields & objects + platform field schema (3) → Lifecycle & gates admin (4) → Requests core (5) → satellite record modules (6–15) → workspace admin (16–18) → platform admin (19) → edge states (20). Then Phase 2 additions (21–24). Then **v2 reconciliation additions (25–29)** — Relationships + config-driven tabs (25) → Status/hold + Watchers preferences (26) → multi-lifecycle + intake picker (27) → multi-dashboard composer (28) → Toolkit (29). Slice 29 depends on 25 (Relationships schema engine); 26–28 are independent of each other and of 29.

Slices with a strict predecessor are marked with `Depends on: <slice #>`.

---

## Release 1 · Phase 1 — the working loop

### Slice 1: Foundation
- **Spec section:** BS §1 (Architecture and tenancy), §4 (Identity and permissions), §6.7 (ID scheme), §12 (Audit), §17.1 (System and identity fields). Requirements §4 (data handling).
- **User capability:** "the platform stands up with a seeded AI Solutions workspace and a PG/Dept template, both discoverable by an SSO'd user."
- **Scope:** database schema for Workspaces / Users / WorkspaceMembership / PrefixRegistry / PlatformField / AuditEntry (append-only, INSTEAD OF triggers) / PlatformAdminGrant / UserGroup. Event Spine emitter + Service Bus wiring. Migrations 001–00N + rollbacks. Seed the two workspaces + platform-defined fields (`AI Solutions Status`, `Legacy ID`, timestamps, IDs) + `AI Intake` seeded user group.
- **Screens covered:** none directly, but every downstream screen depends on this.
- **Estimated LoC:** 5,500 (migrations + procs + tSQLt tests + EF DbContext + Event Spine core).
- **Status: completed**
- **Started:** 2026-07-03T13:05:00-04:00
- **Ended:** 2026-07-03T13:53:18-04:00
- **Duration:** 00:48:18

### Slice 2: Auth & app shell
- **Spec section:** BS §4.1 (Sign in), §4.2 (three access levels + Platform admin grant), §21 (Navigation and information architecture). Requirements Section 5 & the design blueprint's cross-cutting Sidebar shell / Top bar.
- **User capability:** "a user signs in via SSO, lands on a sidebar-shell layout, sees their workspace membership in the top-left workspace switcher, and can toggle theme."
- **Scope:** `GET /health`, `GET /api/v1/users/me`, `POST /api/v1/users/me/theme`. `EnsureUserMiddleware`, `AfdLockdownMiddleware`, `OperationIdMiddleware`, `SecurityHeadersMiddleware`, `CacheControlMiddleware`. Web: `AppShell`, `Sidebar` (with grouped nav sections: Workspace / Reference / Admin), `TopBar` (workspace search stub + bell stub + theme toggle + account menu), workspace-switcher stub. Theme init inline script + persistence.
- **Screens covered:** **S7 Sign in** `[deferred]` (SSO handoff — the SPA reaches a signed-in state; the sign-in page itself is browser-mediated), **S8 Workspace switcher** `[deferred]` (stub in the sidebar; full switching flow is deferred to a later iteration), sidebar shell used by every prototyped screen.
- **Depends on:** 1.
- **Estimated LoC:** 5,800.
- **Status: completed**
- **Started:** 2026-07-03T13:55:00-04:00
- **Ended:** 2026-07-03T15:11:49-04:00
- **Duration:** 01:16:49

### Slice 3: Fields & objects — schema engine
- **Spec section:** BS §2.3 (field-type catalog), §3 (Fields and the condition engine), §17 (Seed field schema), §17.10 (per-stage visibility). Requirements Section 5 (task-level field library).
- **User capability:** "a workspace admin defines and edits the field schema for Requests and Tasks — including per-stage visibility, derived fields, and the task-level typed-field library."
- **Scope:** DB tables `FieldDefinition`, `FieldRule`, `DerivedField`, `SelectOption`, `FieldRuleDependency`. Condition-engine evaluator (acyclic + depth ≤ 3 check at save). Seed the BS §17 Request field set on the AI Solutions workspace and the [S]+[P] subset on the PG template. API: `/workspaces/{id}/fields` CRUD; `/platform/fields` CRUD (S34). Web: **Fields & objects admin (S30)** `[deferred]`, **Platform field schema (S34)** `[deferred]`.
- **Screens covered:** **S30 Fields & objects** `[deferred]`, **S34 Platform field schema** `[deferred]`.
- **Depends on:** 1, 2.
- **Estimated LoC:** 5,900.
- **Status: completed**
- **Started:** 2026-07-03T20:31:22-04:00
- **Ended:** 2026-07-03T21:33:51-04:00
- **Duration:** 01:02:29

### Slice 4: Lifecycle & gates admin (S31 — prototyped)
- **Spec section:** BS §7 (Workflow, lifecycle, and gates), §7.1 (lifecycle as data), §7.2 (approval gates — **team-only slot model per the prototype**), §7.4 (other lifecycle mechanics). Requirements Use Case 2.
- **User capability:** "a workspace admin defines lifecycle stages, gate configuration with team-only approver slots, and Approver Team memberships."
- **Scope:** DB tables `Lifecycle`, `StageDefinition`, `GateDefinition`, `GateApproverSlot`, `ApproverTeamMembership`, `RoleLabelCatalog`. Seed the default "Standard AI build" lifecycle (six stages, each with a status category) + QA-readiness (Build→QA) and Post-launch-readiness (Deploy→Post-launch) gates + role-label catalog, per prototype changelog. API: `/workspaces/{id}/lifecycle` GET/PATCH (full-config reconcile), `/workspaces/{id}/approver-teams` GET/POST/DELETE. Web: **S31 Lifecycle & gates** `[prototyped]` — the Lifecycles bar (add/remove/default) + stages editor (numbered track, status-category, gate icon) + gates editor (name, from→to selects, team-only slot list + live eligible count) + Approver Teams roster (editable member chips per role label).
- **Screens covered:** **S31 Lifecycle & gates** `[prototyped]`.
- **Depends on:** 1, 2, 3.
- **Estimated LoC:** 6,000.
- **Divergence resolved (Step 3):** the prototype renders **multiple per-request-type Lifecycles**, not the flat single stage-set the earlier data-model assumed. Prototype wins (design handoff) — a first-class `Lifecycle` entity was introduced and the data-model / api-contracts / shared types / Slice 3 cross-slice note were updated before build. Approver-team members are **real workspace users** (resolved from a typed name/email); the roster seeds **empty** (prototype's named people are mock fixtures).
- **Status: completed**
- **Started:** 2026-07-03T22:16:02-04:00
- **Ended:** 2026-07-03T23:09:47-04:00
- **Duration:** 00:53:45

### Slice 5: Requests — create, list, detail, edit
- **Spec section:** BS §9 (Records surfaces), §17 (Seed field schema), §22 (List views), §23 (Record detail). Requirements Section 5 (user stories 1–4).
- **User capability:** "a user creates a Request via the Intake form, sees it on the Requests list, opens the Record detail, edits the Intake tab fields, and moves the record through stages."
- **Scope:** DB table `Requests` + `Drafts` + `RequestCrossingSnapshot`. `usp_MintRecordId` stored procedure. API: `POST /requests`, `POST /requests/query`, `GET /requests/{id}`, `PATCH /requests/{id}` (with ETag optimistic concurrency), `POST /requests/{id}/stage` (without gate integration yet — that's slice 8), `POST /requests/{id}/hold`. Web: **S3 Intake form** `[prototyped]` (four numbered sections, paired two-column rows, Client-number conditional reveal, Priority score widget, Submit vs Save draft, inline validation). **S2 Requests list** `[prototyped]` (items-grid pattern, saved-view picker stub — full editor in slice 14, per-column funnel filters, resizable columns, in-list scroll, aging tint hooks — real derivation in Phase 2). **S4 Record detail** `[prototyped]` (compact sticky lifecycle stepper, meta strip with Submitted, three tabs Intake/Tasks & gates/Activity — Intake tab editable with autosave-status indicator on tab row, Tasks & gates + Activity tabs stubbed to slice 7 + slice 6; side panel Relationships/Attachments/Watchers — actual functionality in slices 9, 10, 11). **S26 Drafts** `[deferred]`. **S24 Saved-view editor** stub only (Modify columns / Edit this view / Save as new view actions link out — full editor in slice 14).
- **Screens covered:** **S3** `[prototyped]`, **S2** `[prototyped]`, **S4** `[prototyped]`, **S26 Drafts** `[deferred]`.
- **Depends on:** 1, 2, 3, 4.
- **Estimated LoC:** 6,000 (approaches the ceiling — largest slice; the split-point candidate is Drafts → its own slice if the ceiling is breached).
- **Status: completed** — Drafts kept in-slice (real Draft table + minimal S26 surface, per the "Save Draft persists + resume" decision). Two prototype divergences resolved (data-driven intake form; 6-tab record detail with no right rail) — see [05-slice-requests-core.md](05-slice-requests-core.md).
- **Started:** 2026-07-04T09:02:21-04:00
- **Ended:** 2026-07-04T10:11:30-04:00
- **Duration:** 01:09:09

### Slice 6: Similar-requests nudge + Comments & activity thread
- **Spec section:** BS §9.3 (activity thread), §9.5 (search — access-respecting), §9.8 (similar-requests nudge), §11.2 (mentioned event). Requirements Use Case 3 alt flow (similar-requests match).
- **User capability:** "as I type an intake, the similar-requests panel surfaces likely matches; when I open a record, the Activity tab shows an interleaved thread of comments + system events; I can post an immutable comment and @mention a teammate."
- **Scope:** SQL Server full-text catalog + maintained index on Request Name + Description (workspace-scoped, access-respecting). API: intake nudge endpoint (`GET /workspaces/{id}/requests/similar?query=…`), `POST /records/{id}/comments`, `GET /records/{id}/thread`. Web: **Similar requests panel** on S3 Intake form (up to 3 matches, dismiss/open/link-as-related/discard-draft). Activity tab composer + interleaved thread renderer on S4/S5. @mention parser + Notifications event (delivered in slice 12).
- **Screens covered:** in-record activity thread (part of S4/S5); the intake nudge as part of S3.
- **Depends on:** 5.
- **Estimated LoC:** 4,000.
- **Divergence resolved (Step 3):** the plan named a **SQL Server full-text catalog** for the similar-requests match, but the dev/test stack is **LocalDB, which has no Full-Text component** — a `CREATE FULLTEXT CATALOG` would fail the real-stack validation gate. Resolved (approved at plan-confirmation): `usp_FindSimilarRequests` does a **LIKE-based token-overlap** match on Name + Description (workspace-scoped, access-respecting) — adequate for a top-3 typeahead and portable to every SQL Server. True access-respecting full-text stays with **slice 15 (Search)**, whose own plan already defers the mechanism. Two smaller decisions: `Comments` carries a per-side `WorkspaceId` (like Watcher/AuditEntry) so the thread access-gates and the escalation two-row model holds; the @mention **parser** (web) and the **event-emission** path (API) both ship, but resolving `@handle → userId` needs a user directory (slice 12/17), so the composer sends an empty `mentionedUserIds` until then. See [06-slice-similar-comments.md](06-slice-similar-comments.md).
- **Status: completed**
- **Started:** 2026-07-04T13:38:14-04:00
- **Ended:** 2026-07-04T15:14:57-04:00
- **Duration:** 01:36:43

### Slice 7: Tasks
- **Spec section:** BS §2.4 (Task object), §7.4 (task lock via precondition). Blueprint's Tasks & gates behaviors (typed fields, bundles, phase grouping, Notes & decisions).
- **User capability:** "on a record's Tasks & gates tab I can add single tasks or apply bundle templates, capture a typed field per task, expand Notes & decisions, and mark tasks Done — tasks group by build phase with collapsible headers."
- **Scope:** DB tables `Tasks`, `TaskBundleTemplate` (seed 3 templates per blueprint: Extraction / review build, Drafting assistant, Meeting-driven engagement). API: `POST /requests/{id}/tasks`, `PATCH /tasks/{id}`, `GET /requests/{id}/tasks`, `GET /workspaces/{id}/task-bundles`. Web: tasks section of S4/S5 Tasks & gates tab — phase grouping with collapsible navy-background headers, tabbed composer (Add task / Add bundle) in gray-boxed panel, "+ Add task" link at top of task list, per-task Notes & decisions expandable, typed-field capture (URL/Text/Number/Date/Select/Checkbox), field-as-column rollup demonstration on S2 (Repo URL column). **S25 Task detail** `[deferred]` (for tasks with substantive content).
- **Screens covered:** tasks section of S4/S5 `[prototyped]`; **S25 Task detail** `[deferred]`.
- **Depends on:** 3, 5.
- **Estimated LoC:** 5,500.
- **Scope adjustment (Step 3, approved):** `POST /tasks/{id}/promote-to-request` was listed here but **moved to slice 10**. Promote runs Copy (`POST /records/{id}/copy`) + stamps a typed `related` link back — both land in slice 10, and slice 7 depends only on 3 and 5. Building it here would duplicate slice-10 machinery or ship a half-working endpoint; it lands cleanly in slice 10 where Copy + typed links exist. See [07-slice-tasks.md](07-slice-tasks.md).
- **Status: completed** — plus `GET /workspaces/{id}/task-bundles` (composer bundle picker) and `usp_GetTaskField` (validate + label a captured field). Three decisions recorded in [07-slice-tasks.md](07-slice-tasks.md): promote-to-request → slice 10; task-level signoff buttons superseded by the slice-8 gate model; typed field captured empty on create, value filled inline. Web branch coverage note carried in the slice doc.
- **Started:** 2026-07-04T16:28:54-04:00
- **Ended:** 2026-07-04T17:28:19-04:00
- **Duration:** 00:59:25

### Slice 8: Gates on records + Approvals
- **Spec section:** BS §7.2 (Approval gates), §7.3 (sign-off channel). Requirements Use Case 2 (team-only slots, rejection-requires-comment, re-review row).
- **User capability:** "when a stage advance fires a gate, I see the pending gate inline within its target phase group on the Tasks & gates tab; a team member picks their name, approves or rejects (rejection requires a comment); a rejected slot creates a re-review row and the gate stays in the analyst's Home queue until someone approves."
- **Scope:** DB tables `ApprovalRequests`, `ApprovalDecisions`. Gate-freeze logic (snapshot slot definitions + eligibility at open). API: `POST /approval-requests/{id}/decisions` (400 rejection-requires-comment when Rejected without a comment), `POST /approval-requests/{id}/re-request`, `POST /approval-requests/{id}/proxy-decision` (admin proxy). Wire `POST /requests/{id}/stage` to open a gate when a transition is gated. Web: gate block rendering on S4/S5 Tasks & gates tab — inline within target phase group, AND-join note, per-slot "Select your name" dropdown, Approve/Reject appearing only after name is chosen, rejection-with-comment interaction, re-review row, Re-request approval button, "Changes requested" chip on gate header.
- **Screens covered:** gate section of S4/S5 `[prototyped]`.
- **Depends on:** 4, 5.
- **Estimated LoC:** 5,800.
- **Status: completed** — plus `GET /requests/{id}/approval-requests` (the tab reads gates from it) and gate opening folded into `POST /requests/{id}/stage` (a gated transition returns `{advanced:false, gateOpened}`; `409 gate-already-open` on a second attempt). Three decisions recorded in [08-slice-gates-approvals.md](08-slice-gates-approvals.md): re-request is an explicit endpoint (reconciled durable model, not the prototype's session-only inline re-review); `FrozenApproverSlot`/`ApprovalDecisionDto` extended so the name-picker + rejection lines render without a user-directory fetch; the empty approver roster (seeded empty per slice 4) freezes an empty eligible set — the gate opens but is un-signable until an admin adds members. Home "Needs your decision" surfacing is slice 22 (no Home yet); the gate's `Pending`/`ChangesRequested` state is the data it will read.
- **Started:** 2026-07-04T18:48:41-04:00
- **Ended:** 2026-07-04T19:54:38-04:00
- **Duration:** 01:05:57

### Slice 9: Escalation bridge (S5 — prototyped)
- **Spec section:** BS §6 (The escalation bridge) — the most load-bearing mechanism.
- **User capability:** "a PG member escalates a Request; the AI-side record is created with the shared canonical ID, the PG-side crossing fields lock, the AI Solutions Status mirror is opened, and the AI Intake group is notified. The PG-side view of the record surfaces bridge provenance via an 'Escalated · [origin]' header pill, inline pale-gold crossed-field markers, and a slim mirror note — no separate three-part bridge panel."
- **Scope:** DB — the shared-key UNIQUE constraint on `Requests(RecordId, WorkspaceId)`. Snapshot storage in `RequestCrossingSnapshot`. `LockedAtEscalation` flag on PG-side crossing fields. AI Solutions Status is a platform-defined field with **no manual write path anywhere** (INSTEAD OF UPDATE trigger blocks writes at every access level). API: `POST /requests/{id}/escalate` (confirm-then-lock, `409 already-escalated` on re-attempt, `400 pending-crossing-edits` when uncommitted edits exist). The AI Solutions Status mirror consumer subscribes to `gate.decided`, `request.hold.*`, and `request.closed` events — updates the PG-side row only. Attachments carry across (files follow the record; not governed by the crossing map). Web: **S18 Escalate modal** `[deferred]`; **S5 Escalated record** `[prototyped]` — the entire prototyped variant with inline crossed-field markers + slim mirror note + "Escalated · [origin]" status pill. `POST /requests/{id}/escalate` is disabled if `409 already-escalated` (one-time, one-way — no de-escalation code path).
- **Screens covered:** **S5** `[prototyped]`, **S18 Escalate modal** `[deferred]`.
- **Depends on:** 3, 5, 7, 8.
- **Estimated LoC:** 6,000.
- **Status: completed** — plus `usp_GetCrossingFields` (crossing-map reader) and the PATCH locked-field guard (403 `platform-defined-field-locked`). Decisions recorded in [09-slice-escalation.md](09-slice-escalation.md): the **AI Solutions Status mirror is read-time-derived** (confirmed with the analyst — the dev/test stack has no Service Bus, so the mirror is derived live from the AI-side row's stage/hold/outcome, adding **zero migrations**; the stored+event-driven field defers to Phase 2); **attachment carry-across defers to slice 11** (its table doesn't exist yet — forced by build order); `EscalateResult.aiRecord` is **null for a PG-only escalator** (BS §6.4 — they can't see the AI record; the PG UI refetches the escalated PG record) and `BridgeBlock.lockedFields` is `string[]` (field keys); the crossing map is read from `FieldDefinition` (`Category='Crossing'`), no `CrossingMap` table in Phase 1.
- **Started:** 2026-07-04T21:09:44-04:00
- **Ended:** 2026-07-04T21:55:22-04:00
- **Duration:** 00:45:38

### Slice 10: Closure, Copy, Re-pursuit + Typed links
- **Spec section:** BS §2.2 (typed links), §5 (Copy action), §6.7 (re-pursuit), §8 (outcomes and closure).
- **User capability:** "I can close a record with an Outcome + reason; I can Copy any record to a fresh unlinked draft in the same or a different workspace with an optional `related` or `re-pursuit-of` link back; I can add typed links (`related` / `duplicate-of` / `re-pursuit-of` / `sourced-from`) manually via the side panel."
- **Scope:** DB table `TypedLinks`. API: `POST /requests/{id}/close`, `POST /records/{id}/copy` (returns a Draft ID with prefilled values, respecting the crossing map or same-field-identity per BS §5), `POST /records/{id}/links`, `DELETE /links/{id}`, **`POST /tasks/{id}/promote-to-request`** (moved here from slice 7 — runs Copy against the parent Request, opens a Draft, stamps a `related` link back, cancels the source Task). Web: close-with-Outcome modal on S4/S5; **S19 Copy modal** `[deferred]`; Relationships side-panel card on S4/S5 with "Link a record" action; the Tasks & gates tab's "Promote to request" task action (its API lands here).
- **Screens covered:** closure UI + Relationships side-panel card on S4/S5 `[prototyped]`; **S19 Copy modal** `[deferred]`.
- **Depends on:** 5, 9.
- **Estimated LoC:** 4,200.
- **Status: completed** — close → own `Closure` module + `usp_CloseRequest` (Outcome stored in `FieldValues`, no new columns); Copy + links → `TypedLinks` module; promote-to-request → `usp_GetTaskById` + `CopyService` (Tasks→TypedLinks dep). Decisions in [10-slice-closure-copy-links.md](10-slice-closure-copy-links.md): types reconciled to `collaboration.ts` (no new `typed-links.ts`); `includeAttachments` accepted but no-op until slice 11; copy/promote link-back queued on the draft and stamped as a typed link at submission (`usp_CreateRequest @QueuedLinksJson`, best-effort); `duplicate-of` same-family = id-prefix check; shared `Modal` primitive extracted to Disclosure.
- **Started:** 2026-07-04T22:31:34-04:00
- **Ended:** 2026-07-04T23:19:24-04:00
- **Duration:** 00:47:50

### Slice 11: Attachments
- **Spec section:** `api-blob-attachments.md` + BS §2.3 (files are the Attachments object).
- **User capability:** "I can upload, list, download, and remove attachments on a record; attachments follow the record on escalation."
- **Scope:** Azure Blob Storage authenticated via Managed Identity. Streaming upload endpoint per `api-blob-attachments.md` — no full-file buffering. DB `Attachments` table. Content-type allowlist + 25MB max size enforced at controller boundary. Downloads stream with `Cache-Control: private, no-store`. Web: Attachments card on S4/S5 side panel + drop zone; upload progress; external-link attach.
- **Screens covered:** Attachments card on S4/S5 side panel `[prototyped]`.
- **Depends on:** 5.
- **Estimated LoC:** 3,500.
- **Status: completed** — `Attachments` table + four access-gated procs (create/list/get-by-id/delete), attachment carry-across folded into `usp_EscalateRequest`, `IBlobStreamer` (Azure + Local) storage abstraction, the Attachments module (streaming upload / link / download / delete), and the S4/S5 Attachments-tab card. Decisions recorded in [11-slice-attachments.md](11-slice-attachments.md): (1) **blob storage is config-selected** — `AzureBlobStreamer` via Managed Identity when `Storage:BlobAccountUri` is set, `LocalBlobStreamer` (filesystem) otherwise, so the LocalDB / no-Azure dev stack runs the full cycle (mirrors the Service-Bus no-op + slice-9 derived-mirror precedent); adds `Azure.Storage.Blobs`. (2) **Carry-across = duplicated pointer rows** — escalation copies each live PG attachment as an AI-side row sharing the original `BlobPath` (no blob copy; SQL is the pointer authority). (3) **"Side panel" → the existing Attachments tab** — the as-built 6-tab record detail has no right rail (slice-5 reconciliation), so the card wires into its Attachments tab like Relationships/Tasks/Activity. (4) **413 for oversize, 400 for disallowed type** — following api-contracts §8 (which specifies 413) over the api-blob-attachments generic "400 for both". (5) `apiClient` extended with FormData upload + `apiFetchBlob` (bearer-authenticated download).
- **Started:** 2026-07-05T08:38:16-04:00
- **Ended:** 2026-07-05T09:14:48-04:00
- **Duration:** 00:36:32

### Slice 12: Watchers + Notifications (bell centre)
- **Spec section:** BS §11.1 (event spine), §11.2 (firm-default notification rules), §11.3 (channels and groups), §17.3 (Watchers).
- **User capability:** "I can subscribe to a record I don't own via the side panel toggle; the bell in the top bar shows my notifications and announcement history; @mentions, gate-decided, closed, and other events fan out to the right people (Watchers, Requestor, Business Owner, Approvers) with dedup for cross-side receivers."
- **Scope:** DB tables `Watchers`, `Notifications`. Notifications consumer of the event spine (Worker-side for cross-service fan-out per `api-worker.md`; peek-lock semantics). API: `POST/DELETE /records/{id}/watchers`, `GET /notifications/query`, `POST /notifications/mark-all-read`, `POST /notifications/{id}/mark-read`. Web: **S20 Bell centre** — the top-bar bell popover surfaces real notifications (not stubs anymore); Watchers card on S4/S5 side panel with self-subscribe toggle.
- **Screens covered:** **S20 Bell centre** `[deferred → real]`; Watchers card `[prototyped]`.
- **Depends on:** 1, 5, 8, 9.
- **Estimated LoC:** 4,800.
- **Status: completed** — `Watchers` + `Notifications` tables + access-gated procs; **`usp_FanOutNotification`** run **in-process** on the event spine via `NotificationFanoutConsumer` (registered next to `AuditWriter`; the Worker/Service-Bus path stays documented but is a no-op in dev — slice 9/11 precedent). Fan-out targets are the user-resolvable ones only (Watchers, mentioned users, frozen gate approvers, AI-Intake group) — Requestor/Business Owner are Phase-1 text field values, not user refs, so are not targeted (matches module-boundaries §16). Web: real bell popover + unread badge; Watchers card on the record-detail Watchers & alerts tab. Decisions in [12-slice-watchers-notifications.md](12-slice-watchers-notifications.md): in-process fan-out; `POST /notifications/query` (not GET) + `GET /notifications/unread-count`; added `GET /records/{id}/watchers` + `WatcherListItemDto`/`WatcherListDto`; empty AI-Intake roster fans to zero (slice 8 precedent).
- **Started:** 2026-07-05T10:49:33-04:00
- **Ended:** 2026-07-05T12:07:54-04:00
- **Duration:** 01:18:21

### Slice 13: Announcements
- **Spec section:** BS §2.7 (Announcement object), §20 (schema).
- **User capability:** "a workspace admin posts a Draft announcement, sets audience, pins it or gives it an expiry, publishes it — the announcement fans to the bell for everyone in the audience and (if pinned) shows in the slim strip on the Home."
- **Scope:** DB `Announcements` table. API: `/announcements/*` (create, patch, publish, retire, query). Event spine: `announcement.published` fans "Announcement posted" via slice 12's Notifications consumer. Web: **S21 Announcement detail** `[deferred]`, **S22 Announcements list** `[deferred]`, **S23 Manage announcements** `[deferred]`. Pinned strip integration is deferred to slice 22 (Home) — no Home surface exists in Phase 1.
- **Screens covered:** **S21**, **S22**, **S23** all `[deferred]`.
- **Depends on:** 12.
- **Estimated LoC:** 4,500.
- **Status: completed** — admin authoring is workspace-scoped (`/workspaces/{id}/announcements[/query]`, matching Lifecycle §18); consumer reads flat/cross-workspace (`POST /announcements/query`, `GET /announcements/{id}`); item mutations author-or-admin. Bell deep-link via a new nullable `Notifications.AnnouncementId`; fan-out reuses slice-12's in-process `usp_FanOutNotification` (new `announcement.published` branch). Audience picker is comma-separated text (people/role picker → slice 17); body renders as plain text (no sanitizer yet); pinned-Home strip deferred to slice 22. See [13-slice-announcements.md](13-slice-announcements.md).
- **Started:** 2026-07-05T12:57:18-04:00
- **Ended:** 2026-07-05T14:22:37-04:00
- **Duration:** 01:25:19

### Slice 14: Feature Catalog (S9, S10, S13) + Saved-view editor (S24)
- **Spec section:** BS §2.5 (Feature Catalog), §18 (schema), §22.3-22.4 (saved-view picker and editor).
- **User capability (1):** "I can browse the Feature Catalog list, open a feature detail, and harvest a Feature draft from a shipped Request via Add-to-catalog; on submit the platform stamps a `sourced-from` link back."
- **User capability (2):** "I can author or edit a saved view via a tabbed side sheet — Filters (row-based `field + comparator + value` builder ANDing together), Fields (shuttle for columns + order), Sort (reorderable rows)."
- **Scope:** DB `Features` table. API: `/features/*`, `/requests/{id}/add-to-catalog`, `/saved-views/*`. Web: **S9 Feature catalog** `[deferred]`, **S10 Feature detail** `[deferred]`, **S13 Add to catalog** `[deferred]`. **S24 Saved-view editor** `[deferred]` — the tabbed side sheet with the condition-engine-surfaced Filters builder, Fields shuttle, Sort rows, personal/shared scope toggle, default-view toggle. Wire the S2 saved-view picker's Modify/Edit/Save-as-new actions to the editor.
- **Screens covered:** **S9**, **S10**, **S13**, **S24** all `[deferred]`.
- **Depends on:** 3 (saved views need field definitions), 5 (Add-to-catalog reads a shipped Request), 10 (typed link creation).
- **Estimated LoC:** 5,500.
- **Status: completed** — Features table + 5 access-gated procs; SavedView table (with an added `ObjectType` discriminator) + 4 procs; both API modules; the saved-views feature (S24 tabbed side sheet) wired into **both** the S9 and S2 pickers; S9 list (disabled Gallery toggle per the S11 deferral), S10 detail (reusing the Attachments + Relationships cards for visuals + `sourced-from` provenance), S13 form with an Add-to-catalog entry on the Request detail (S4). Decisions in [14-slice-feature-catalog-saved-views.md](14-slice-feature-catalog-saved-views.md): Add-to-catalog is a **service** (mirrors Copy — no new proc); `POST /features/query` replaces the contract's stray `GET /query`; `objectType` added to the saved-view types/endpoints so a view binds to one surface; the feature list gates on AI-workspace Viewer+ (firm-wide read → slice 23); `FeatureCreateRequest.owner` optional + `FeatureDto.eTag` shared-type refinements.
- **Started:** 2026-07-05T15:20:38-04:00
- **Ended:** 2026-07-05T16:53:45-04:00
- **Duration:** 01:33:07

### Slice 15: Search
- **Spec section:** BS §9.5 (search — access-respecting, no OCR, Legacy ID searchable).
- **User capability:** "the top-bar workspace search returns up to 6 records matching my query; a full Search Results surface shows access-respecting hits across fields, comments, and attachment filenames — with snippets and match-kind (record/comment/attachment)."
- **Scope:** SQL Server full-text index refreshed via triggers (or scheduled ETL if trigger latency is unacceptable — decided at implementation time). API: `GET /search`, `POST /search/full`. Web: top-bar workspace-search popover (replaces the stub from slice 2); **S27 Search results** `[deferred]`.
- **Screens covered:** top-bar workspace-search popover `[prototyped]`; **S27 Search results** `[deferred]`.
- **Depends on:** 5, 6.
- **Estimated LoC:** 3,000.
- **Divergence resolved (Step 3):** the plan named a **SQL Server full-text index** but the dev/test stack is **LocalDB, which has no Full-Text component** — the same wall slice 6 hit and deferred here. Resolved (approved at plan-confirmation): both procs use **LIKE-based token overlap**, workspace-scoped + access-gated by a `WorkspaceMembership` join — `usp_SearchRecords` (records: Name/Description/RecordId/Legacy ID, top 6) and `usp_SearchFull` (S27: records + comment bodies + attachment filenames, paged). No OCR; Legacy ID (in `FieldValues`) searchable. Access returns **empty, never 403** (never discloses existence — BS §9.5/§22.6). No new tables. See [15-slice-search.md](15-slice-search.md).
- **Status: completed** — plus the shared extraction of `resolveActiveWorkspaceId` → `shared/workspace/activeWorkspace.ts` (3rd consumer) and a new `useDebouncedValue` hook. Pre-existing `tsc` errors in slice 6/8/11/12 test files surfaced (none in slice 15) and left for cleanup — they don't gate this ship flow.
- **Started:** 2026-07-05T21:32:19-04:00
- **Ended:** 2026-07-05T22:22:54-04:00
- **Duration:** 00:50:35

### Slice 16: CSV Import & Export
- **Spec section:** BS §13 (Import, export, and the API).
- **User capability:** "a workspace admin uploads a CSV to create records (never update), receives a per-row validation report — landed rows plus flagged rows with reasons; Requestor resolves via SSO or falls back to the importing admin with a flag. Export View button on every items list exports the active saved view (columns follow the view, rows follow the caller's entitlements)."
- **Scope:** Worker-hosted import processor. `usp_MintRecordId` called per row from Worker (concurrent with in-app minting — same counter, no collisions per BS §6.7). API: `POST /workspaces/{id}/imports/csv` (multipart, streaming), `GET /imports/{id}`, `POST /exports`. Web: **S28 Import & export** `[deferred]`. Wire the Export View button on every items list.
- **Screens covered:** **S28 Import & export** `[deferred]`; Export View buttons on S2 (and later S9, S22, audit logs).
- **Depends on:** 1, 3, 5.
- **Estimated LoC:** 4,500.
- **Status: completed** — DB `Imports` + `ImportRows` (migrations 046/047) + 5 access-gated procs + tSQLt. API `Modules/ImportExport` — `ImportService` (stream → blob → `usp_CreateImport` → enqueue → 202), in-process `ImportProcessor`/`ImportQueue` + scoped `ImportRunner` (CsvHelper parse → `IRequestsService.CreateAsync` per row → record → complete), DbContext-free `ExportService`, pure `CsvRowMapper`/`ImportOutcomeMapper`/`CsvExportWriter`. Web `features/import-export` (S28 page + Import/Export panels + report table), `useExportView` wired to the S2 Export button, `/admin/import-export` route promoted from placeholder. Decisions (see [16-slice-import-export.md](16-slice-import-export.md)): in-process processing (no Service Bus in dev — slice 9/11/12 precedent, analyst-approved); **CsvHelper 33.1.0** added (analyst-approved); Requestor SSO-resolve with flagged admin fallback; export composes the access-gated Requests query (Request-object views only in R1; keyed on a real saved view); added `ISavedViewsService.GetByIdAsync`, `ImportStartResponse`, `apiFetchBlobPost`, `saveBlob`. New tsc errors: 0 (13 pre-existing test-file errors from slices 6/8/11/12 left per slice 15).
- **Started:** 2026-07-05T23:23:34-04:00
- **Ended:** 2026-07-06T00:08:06-04:00
- **Duration:** 00:44:32

### Slice 17: Users & access admin
- **Spec section:** BS §4.2 (access levels), §6.8 (deactivation and reassignment).
- **User capability:** "a workspace admin manages membership — assigns Viewer/Member/WorkspaceAdmin level, deactivates users. Deactivation with a pending named-individual sign-off is blocked; open owned or assigned records don't block deactivation but notifications to disabled accounts are suppressed."
- **Scope:** API: `POST /workspaces/{id}/members`, `DELETE /workspaces/{id}/members/{userId}`. Enforce the §6.8 safety floor. Web: **S29 Users & access** `[deferred]`.
- **Screens covered:** **S29 Users & access** `[deferred]`.
- **Depends on:** 2.
- **Estimated LoC:** 2,500.
- **Status: completed** — no new tables (reuses `WorkspaceMembership` / `Users` / `ApprovalRequests`). Three procs (`usp_ListWorkspaceMembers` / `usp_UpsertWorkspaceMembership` / `usp_DeactivateMember`) + tSQLt; the `Users` API-module `MembersController`/`MembersService` (WorkspaceAdmin-gated, event-spine emits); the S29 web surface (members table + email-resolve add form + destructive-confirm deactivate). Two decisions (see [17-slice-users-access.md](17-slice-users-access.md)): (1) `MembershipUpsertRequest` refined to `{ userId?, email?, level }` (exactly one) so "Add member" resolves an email server-side — no user-directory endpoint exists in R1; api-contracts §2 + the shared type updated first. (2) Deactivate = disable the account firm-wide (`Users.IsDisabled=1`, per BS §6.8 "disabled immediately" — analyst-confirmed) **and** soft-delete this-workspace membership; the §6.8 `409` block scans `FrozenApproverSet` for a `namedUserId` marker — structurally present but never fires in the team-only slot model (team-slot eligibility never blocks). Also added `GET /workspaces/{id}/members` (list read, WorkspaceAdmin). Pre-existing 13 tsc test-file errors (slices 6/8/11/12) unchanged; 0 new.
- **Started:** 2026-07-06T07:15:11-04:00
- **Ended:** 2026-07-06T07:43:52-04:00
- **Duration:** 00:28:41

### Slice 18: Views & dashboards admin + workspace audit
- **Spec section:** BS §10.2 (audience two-layer), §10.5 (workspace locality), §12 (audit surfaces).
- **User capability (1):** "a workspace admin manages shared saved views and shared dashboards for their workspace — audiences, defaults, promote from personal."
- **User capability (2):** "a workspace admin reads their own workspace's audit log — chronological event list filtered by date / actor / record / event type."
- **Scope:** API: `/workspaces/{id}/dashboards`, `PATCH /saved-views/{id}` shared-scope permissions, `/workspaces/{id}/audit/query`. Web: **S32 Views & dashboards** `[deferred]`, **S33 Workspace audit** `[deferred]`.
- **Screens covered:** **S32**, **S33** both `[deferred]`.
- **Depends on:** 14, 1 (audit table).
- **Estimated LoC:** 3,500.
- **Divergence resolved (Step 3, approved):** the slice's **shared-dashboards** management half (part of S32) is **deferred to slice 23**. The `SavedDashboard` table + Dashboards module are owned by slice 23 (data-model §Slice-1 note — "FK to `SavedDashboard` is added in slice 23 when that table exists"; module-boundaries §15), and no dashboards exist to manage until slice 23 seeds them. Slice 18 builds the S32 shared-**views** management fully; the dashboards panel is an explicit "arrives with dashboards" note, not a dead control (mirrors the build-order deferrals in slices 9→11, 13→22). Three smaller decisions: (1) the audit query is **`POST /workspaces/{id}/audit/query`** (api-contracts §18 text said `GET`, but api/CLAUDE.md mandates POST-with-body for filtered/paginated reads and every peer `/query` endpoint is POST); (2) **`PATCH /saved-views/{id}` shared-scope permissions were already satisfied by slice 14** (`SavedViewsService.CanWriteAsync` gates shared create/edit/promote to WorkspaceAdmin) — slice 18 adds the S32 surface that exercises it, no new saved-views API; (3) **no migration** — `AuditEntry` + its `IX_AuditEntry_Workspace_EventAt_EventType` index were created in slice 1 *for this slice*, and `SavedView` exists from slice 14, so the only DB artifact is the new `usp_QueryWorkspaceAudit` proc. New `shared/types/audit.ts` added (`AuditLogRowDto`, `AuditLogQuery`). Pre-existing 13 tsc test-file errors (slices 6/8/11/12) unchanged; 0 new. See [18-slice-views-audit.md](18-slice-views-audit.md).
- **Status: completed**
- **Started:** 2026-07-06T10:03:15-04:00
- **Ended:** 2026-07-06T10:36:13-04:00
- **Duration:** 00:32:58

### Slice 19: Platform admin — crossing map (read-only seed), access, role-labels, workspace provisioning, firm-wide audit
- **Spec section:** BS §4.3 (Platform admin), §6.2 (crossing map — R1 Phase 1 read-only seed), §7.2 (role-label catalog), §1.1 (workspace provisioning — R1 Phase 1 out-of-band).
- **User capability:** "a Platform admin manages firm-wide config: reads the seeded crossing map (editing is R1 Phase 2 — see slice 24), manages platform-admin grants and workspace-admin holders, edits the role-label catalog (Manager / PG Lead / GCO / InfoSec / Data Privacy, extensible), provisions new workspaces (out-of-band clone in Phase 1), and reads the firm-wide audit log."
- **Scope:** DB tables `CrossingMap`, `RoleLabelCatalog`, `PlatformAdminGrant`. API: `/platform/crossing-map` (GET only in Phase 1), `/platform/role-labels` (CRUD), `/platform/access` (CRUD), `POST /api/v1/workspaces` (server-side clone from PG/Dept template — used by ops tooling in Phase 1 and by S38's in-app wizard in Phase 2), `/platform/audit/query`. Web: **S34 Field schema** was built in slice 3 (kept as `[deferred]` from a UI-completion perspective in this slice — polish or ship as-is); **S35 Crossing map** `[deferred]` (read-only in Phase 1 — displays the seeded map). **S36 Access provisioning** `[deferred]`. **S37 Role-label catalog** `[deferred]`. **S38 Workspace provisioning** `[deferred]` (Phase 1 = API only; the wizard UI lands in slice 24). **S39 Firm-wide audit** `[deferred]`.
- **Screens covered:** **S35**, **S36**, **S37**, **S38** (API only), **S39** all `[deferred]`.
- **Depends on:** 1, 2, 3, 17.
- **Estimated LoC:** 5,000.
- **Divergences resolved (Step 3, analyst-approved):** (1) **No `CrossingMap` table** — `RoleLabelCatalog` (slice 4) and `PlatformAdminGrant` (slice 1) already exist, and the Phase-1 crossing map is read-only, so S35 reads the seeded PG→AI pairs off `FieldDefinition` via `usp_GetCrossingMap` (workspaces resolved by `Kind`, no seed GUIDs) — matching slice 9's `usp_GetCrossingFields`/data-model "no CrossingMap table in Phase 1". The durable table + propose/confirm stays slice 24. (2) **Role-labels are GET+POST+PATCH+DELETE** (a superset of api-contracts §19's GET/POST) to honour blueprint S37's "add / rename / retire"; rename/retire are forward-only (procs never touch `GateApproverSlot` / `ApproverTeamMembership` / `ApprovalRequest`). (3) **`POST /workspaces` clones the PG/Dept template** (`usp_ProvisionWorkspace`: workspace + `PrefixRegistry` + initial-admin membership + the template's `FieldDefinition`/`SelectOption`/`FieldRule`/`DerivedField`/`FieldRuleDependency` via id-remap); the template ships no lifecycle, so a new PG workspace has none either (admins configure via S31). Response is a focused `WorkspaceProvisionResult` (`{id,name,kind,prefix}`), not the awkward member-less `WorkspaceDto`. `GET /workspaces` was not needed (the switcher reads `/users/me` memberships) and is out of scope. (4) **S34 was already built in slice 3** (`/platform/fields`) — no rebuild; slice 19 only adds the Platform nav section that surfaces it. (5) Platform-level events anchor on the AI Solutions workspace id (the `PlatformFieldService` slice-3 convention — `AuditEntry.WorkspaceId` is NOT NULL) so role-label / grant edits land in the firm-wide audit; `workspace.provisioned` anchors on the new workspace. See [19-slice-platform-admin.md](19-slice-platform-admin.md).
- **Status: completed**
- **Started:** 2026-07-06T11:21:32-04:00
- **Ended:** 2026-07-06T12:21:55-04:00
- **Duration:** 01:00:23

### Slice 20: Error / empty edge states (S40, S41, S42)
- **Spec section:** `loading-empty-and-error-states.md` + BS §22.6 (no-access response).
- **User capability:** "when I follow a link to a record I can't see, I get a no-access response that never reveals record existence; when a workspace is empty, I get a Zero-data empty state with a 'Create your first request' CTA; when my filters exclude all rows, I get a bordered card 'No matches for these filters' with a 'Clear filters' secondary CTA."
- **Scope:** shared web components `NoAccessPage`, `EmptyListZeroData`, `EmptyListFilteredToZero`. Wire into every list surface (S2 / S9 / S22 / audit logs / dashboards' embedded grid) and every record-detail route.
- **Screens covered:** **S40**, **S41**, **S42** all `[deferred]`.
- **Depends on:** 2.
- **Estimated LoC:** 1,500.
- **Status: completed** — three shared `EdgeStates` components (`NoAccessPage`/`EmptyListZeroData`/`EmptyListFilteredToZero`) replacing the ad-hoc inline empty/no-access markup across the named surfaces. Decisions: (1) the design-system `.mws-empty` classes already existed, but `.mws-empty__body` used `--text-secondary` — fixed to navy on the pale zero/no-access variants (theme-stable rule) and theme-aware only on the bordered filtered card. (2) `NoAccessPage` renders on **any 403** (the API returns 403 identically for forbidden and non-existent — never a 404); it takes a `resourceNoun` for the object type only, and its CTA always goes to Home per the blueprint (no `homeTo` override on the wired surfaces). (3) In-card "no items" notes (Attachments/Watchers/Gates/Relationships/option editors) were left as-is — section-level, not the S40/S41/S42 canonical list/route states. (4) Dashboards' embedded grid is out of scope (no dashboards until slice 23). (5) Orphaned `.rl-empty`/`.fc-empty`/`.record-noaccess` CSS removed. New tsc errors: 0 (one pre-existing error in `platform-admin/api.test.ts`, untouched here, left for the test-file cleanup pass per the slice-15–18 precedent).
- **Started:** 2026-07-06T14:29:26-04:00
- **Ended:** 2026-07-06T14:50:01-04:00
- **Duration:** 00:20:35

---

## Release 1 · Phase 2 — workspace usability

### Slice 21: Current-date + date-difference primitive + SLA Status
- **Spec section:** BS §3.1 (current-date reference), §3.3 (calculation stays numeric-only), §10.6 (cycle-time and time-in-stage), §17.2 (SLA Status).
- **User capability:** "records show aging tint on the Requests list, live time-in-stage on the Record detail, and SLA Status (On track / Due soon / Overdue) derived from Due Date."
- **Scope:** Condition-engine extension — current-date reference. Date-difference primitive (elapsed time between two dates or a date and current-date). SQL side: computed columns for `TimeInStage`, `SlaStatus` where possible; view functions for the rest. Web: aging tint applied to every list row driven by SLA Status; time-in-stage display in Record detail meta strip. The "due soon" window is a workspace-level config value.
- **Screens covered:** aging tint on S2 and every save-for-/build list surface `[prototyped]`; SLA Status pill on S4/S5 `[prototyped hooks]`.
- **Depends on:** 5.
- **Estimated LoC:** 3,000.
- **Status: completed** — `StageEnteredAt` column (migration 048, stamped on create + reset-on-change in `usp_SetRequestStage`) + `Workspaces.DueSoonWindowDays` (migration 049, default 3). SLA Status + time-in-stage are **query-time derived in the C# service** (both depend on current-date, so neither can be a persisted computed column — matching the "view functions for the rest" clause): `ComputeSla(due, today, window)` is now three-state (`OnTrack`/`DueSoon`/`Overdue`, was list-only + hardcoded-3) applied to **both** list and detail; `ComputeTimeInStage`. `ConditionEngine` gained the §3.1 current-date reference (`@today`/`@now`/`@currentDate` token + date-aware comparisons) and the §3.3 `DateDifferenceDays` primitive, both off the injected `IClock`. Web: an SLA **pill** fills the prototype's binary SLA slot with the three-state derivation; **Time in stage** added to the S4/S5 meta strip; list aging tint was already wired (slice 5) — now driven by the config window. Decisions in [21-slice-sla-timeinstage.md](21-slice-sla-timeinstage.md). API + test projects build clean (0/0); web tsc/jest deferred to the ship gate (no local node_modules).
- **Started:** 2026-07-06T15:57:44-04:00
- **Ended:** 2026-07-06T16:28:11-04:00
- **Duration:** 00:30:27

### Slice 22: Home surface (S1 — prototyped)
- **Spec section:** BS §10.7 (Home surface). Requirements user-story panel list.
- **User capability:** "when I sign in I land on Home — a per-user landing composing viewer-scoped queries into panels: Needs your decision · Your work today · Since you were last here · New to triage · Pinned announcements. Quick-create and Pin-as-home affordances round it out."
- **Scope:** `current-user` reference in the condition engine. API: `GET /home` composite endpoint. Web: **S1 Home** `[prototyped]` — the four viewer-scoped-query panels, the pinned-announcement slim strip at the top, and the "Pin as home" affordance next to the page heading. Quick-create is scoped to the Requests list per prototype changelog (top-bar quick-create was replaced by workspace search in slice 15; no top-bar quick-create in Phase 2 either).
- **Screens covered:** **S1 Home** `[prototyped]`.
- **Depends on:** 21, 5, 6, 8, 12, 13.
- **Estimated LoC:** 5,500.
- **Status: completed** — new `Modules/Home` (`GET /api/v1/home?workspaceId=`, Viewer-gated) composes five focused procs (`usp_GetHomeDecisions`/`Work`/`Activity`/`Triage`/`GetHomePinnedAnnouncements`) into `HomeDto`; `Users.LastHomeSeenAt` (migration 050) anchors "Since you were last here" (read-prev → stamp-now, OUTPUT param); `ConditionEngine` gains the `@currentUser`/`@me` token; web `features/home` builds the S1 four-panel layout + pinned strip + Pin-as-home. Four reconciliations resolved (workspace-scoped `/home`; `CreatedBy`-as-ownership + no-analyst triage; `quickCreateStubs` dropped; Pin-as-home is a static indicator) and the scaffold's placeholder Home types (in `notifications.ts`) excised in favour of the real `home.ts`. See [22-slice-home.md](22-slice-home.md).
- **Started:** 2026-07-06T17:09:56-04:00
- **Ended:** 2026-07-06T17:46:37-04:00
- **Duration:** 00:36:41

### Slice 23: Seeded dashboards — AI Solutions default (S6), Workload (S14), Feature Catalog (S12); Dashboards list + PG starter + Dashboard-viewer surface
- **Spec section:** BS §10.2 (widget palette), §10.3 (AI Solutions default), §10.3.1 (Workload), §10.3.2 (Feature Catalog dashboard), §10.4 (Dashboard-viewer), §10.5 (starter dashboards and locality).
- **User capability:** "the AI Solutions Manager and analysts have three seeded fixed-layout dashboards + a Dashboards list; PG workspaces have a starter dashboard; firm-wide viewers can consume the Feature Catalog dashboard read-only via the Dashboard-viewer surface."
- **Scope:** Widget-type implementations (KPI tile, KPI-with-trend, segmented bar, bar breakdown, histogram, line-timeseries, heatmap matrix, records grid) — data queries per-widget, each access-respecting. API: `GET /workspaces/{id}/dashboards`, `GET /dashboards/{id}`. Web: **S6 AI dashboard** `[prototyped]` — the four-uniform-tiles Row 1 + full-width heatmap Row 2 + records grid Row 3 layout. **S14 Workload dashboard** `[deferred]`, **S12 Feature Catalog dashboard** `[deferred]`, **S15 PG starter dash** `[deferred]`, **S17 Dashboards list** `[deferred]`, **S16 Dashboard viewer** `[deferred]` (no-rail surface bound to one dashboard).
- **Screens covered:** **S6** `[prototyped]`; **S12**, **S14**, **S15**, **S16**, **S17** all `[deferred]`.
- **Depends on:** 21, 5, 14 (saved views drive records-grid widget).
- **Estimated LoC:** 6,000.
- **Carried from slice 18:** this slice creates the `SavedDashboard` table + Dashboards module, so it also owns the **S32 shared-dashboards management half** deferred from slice 18 (audience picker · promote · retire for shared dashboards). Slice 18 already ships the S32 shared-**views** half and a placeholder note in the S32 surface pointing here — replace that note with the real dashboards-management panel.
- **Status: completed** — `SavedDashboard` table (mig 051) + the deferred `WorkspaceMembership.BoundDashboardId` FK (mig 052 — **not** `Users`; contract §2 corrected to the real schema) + seed of 4 dashboards (mig 053) + a `usp_ProvisionWorkspace` clone of template dashboards (§10.5); 19 procs (3 CRUD + 16 metric resolvers) + tSQLt; `Modules/Dashboards` (list · detail-with-widgets-resolved-per-viewer · patch) on a **widget-list-JSON-on-row + fixed metric-resolver** engine (analyst-approved over slug-dispatch — clonable local objects, R2-builder-forward). S6 built exactly from the prototype (live drill-through, 8-col Dept/PG/Client × status heatmap, records grid reusing the S2 `TableShell`, Pin-as-home) via a generic `DashboardSurface`/`WidgetRenderer` reused for S14/S12/S15/S16; S17 list; S16 bound Dashboard-viewer (drill suppressed via `supportsDrillThrough=false`); S32 management panel replaces slice-18's placeholder. Access: Viewer+ on the dashboard's workspace OR a bound Dashboard-viewer (`WorkspaceMembership.BoundDashboardId`), 403-not-404. Five internal divergences (BoundDashboardId→WorkspaceMembership; escalation-status via crossing-snapshot presence; closure-time via `UpdatedAt`; median-triage via `CreatedAt→StageEnteredAt`; feature-grid mapped into the shared grid-row slots) — every output contract unchanged, so API/Web bindings held. API + Api.Tests build clean (0/0, independently verified); web tsc/jest + tSQLt deferred to the `/dev-ship` gate (no local `node_modules` — slices 15/16/21 precedent). See [23-slice-dashboards.md](23-slice-dashboards.md).
- **Started:** 2026-07-06T19:27:26-04:00
- **Ended:** 2026-07-06T20:29:16-04:00
- **Duration:** 01:01:50

### Slice 24: Advanced views + self-serve workspace provisioning + admin-editable crossing map
- **Spec section:** BS §10.5 (advanced views incl. gallery), §15 Phase 2 (self-serve workspace provisioning, admin-editable crossing map).
- **User capability:** "workspace admins can use advanced views — Kanban, timeline, gallery (feeds S11), agenda — on their surfaces; Platform admins provision new workspaces via an in-app self-serve wizard; the crossing map is admin-editable via a propose (PG side) / confirm (AI side) workflow with type-compat and option-set checks."
- **Scope:** Advanced view rendering (Kanban / timeline / gallery / agenda). Wire S11 Feature gallery (uses gallery view). API: `POST /platform/crossing-map` (propose) + `PATCH /platform/crossing-map/{id}` (confirm). Web: **S11 Feature gallery** `[deferred]`, updated **S35 Crossing map** UI (propose/confirm workflow), **S38 Workspace provisioning** wizard UI.
- **Screens covered:** **S11 Feature gallery** `[deferred]`; **S35 Crossing map** (Phase 2 upgrade) `[deferred]`; **S38 Workspace provisioning** UI `[deferred]`.
- **Depends on:** 14, 19.
- **Estimated LoC:** 4,500.
- **Status: completed** — built in three checkpointed sub-cuts (A advanced views + S11 gallery, B S38 provisioning wizard, C S35 editable crossing map). Advanced views are an ad-hoc per-surface toggle (not persisted on saved views — the blueprint names a "toggle"); gallery thumbnails resolve the first image attachment (`usp_QueryFeatures` join). S38 extends `usp_ProvisionWorkspace` with an initial-admin **email** resolve (R1 has no user-directory endpoint — mirrors S29/S36). S35 adds a durable `CrossingMap` table (mig 054) + propose/confirm procs (type-compat + direction + one-to-one + option-set guards) + the deferred retire guard in `usp_RetireFieldDefinition`; both propose and confirm are Platform-admin-gated (S35 is in the Platform-admin-only band, so a distinct AI-workspace confirmer can't reach it — the two-step keeps a mapping inert until confirmed). API + Api.Tests build 0/0; web `tsc` clean; 16 crossing/provisioning controller tests + all touched web suites green; tSQLt authored (run at the ship gate). See [24-slice-advanced-views-provisioning-crossing.md](24-slice-advanced-views-provisioning-crossing.md).
- **Started:** 2026-07-06T21:20:35-04:00
- **Ended:** 2026-07-06T22:42:34-04:00
- **Duration:** 01:21:59

---

## Release 1 · v2 reconciliation additions

*Added 2026-07-16 per the [v2 reconciliation addendum](v2-reconciliation.md). The v2 prototype export codified concepts absent from the original 24-slice plan; these five slices land what's genuinely new. Toolkit and the no-code dashboard composer were pulled into R1 Phase 2 by the 2026-07-07 re-phasing (see build spec §15).*

### Slice 25: Object-level Relationships + Link-to-record field type + config-driven detail tabs + system-provisioned fields
- **Spec section:** blueprint §Fields, objects & relationships schema (S30/S34), §Record detail behaviors (config-driven tab bar), §Cross-cutting notes → Fields. Requirements §5 Expected Output (record detail row). [v2-reconciliation.md §Model deltas 1–2, §Module deltas Relationships, §API deltas Relationships].
- **User capability:** "a workspace admin defines object-level Relationships (From/To object, cardinality, both side labels, optionally surface as a Request-detail tab); the schema engine auto-provisions the paired Link-to-record fields; the Fields tab shows system-provisioned fields as a locked band; the record detail renders a config-driven tab bar (Status / Intake / Activity / Watchers & alerts base + Tasks & gates / Attachments as relationship-driven tabs); users add a linked record from the Relationships side panel."
- **Scope:**
  - **DB:** `Relationships` table (§Model deltas 1); `FieldDefinition` columns `IsSystemProvisioned`, `TargetObjectType`, `AllowMultiple`, `ReverseLinkLabel`, `RelationshipId` (§Model deltas 2); seed rows for the five system-provisioned fields on Request / Task / Feature.
  - **Procs:** `usp_UpsertRelationship` (auto-provisions Link-to-record fields in the same transaction), `usp_RetireRelationship`, `usp_ListRelationships`, `usp_UpsertRecordLink`, `usp_ListRecordLinks`. Guard: retiring a Relationship with existing links returns 409 with the link count; the S30 editor confirms then soft-retires.
  - **API:** `/api/v1/workspaces/{id}/relationships` CRUD + `/api/v1/records/{recordId}/links` CRUD per [v2-reconciliation.md §API deltas Relationships]; extends `POST /workspaces/{id}/objects` (register `ToolkitItem` etc.) — actual Toolkit object lands in slice 29.
  - **Web:** S30 Relationships tab; S4/S5 config-driven tab bar rewrite (base + relationship-driven tabs via `useRelationshipTabs`); `GenericRelatedRecordsTab` component; `RelationshipsSidePanel` component; Fields tab surfaces the locked system-provisioned band.
- **Screens covered:** **S30 Fields & objects** `[prototyped]` (Relationships tab + system-provisioned marker); **S4** `[prototyped]` (config-driven tab bar); **S5** `[prototyped]` (same, with escalation additions preserved).
- **Depends on:** 3, 5.
- **Estimated LoC:** 6,000 (at the ceiling — model + procs + tSQLt + API + shared types + web).
- **Locked-signature changes flagged:** `FieldDefinitionDto` extensions; new `RelationshipDto` + `RelationshipLinkDto`. Every existing consumer compiles unchanged (all new properties are optional or additive-union).
- **Status: completed** — full scope landed across two sessions. Session 1: DB (migrations 055–059 + rollbacks), 8 procs + 2 tSQLt classes, shared types (`isSystem`, `direction`, `RelationshipRetireResponse`), full API module (service + `RelationshipsController` + `RecordLinksController` + DbContext / DI wiring), `useRelationshipTabs` + `RelationshipsSidePanel`. Session 2: web jest tests (4 test files, 25 cases), S30 `RelationshipsAdminTab` (+ tests), S30 `SystemProvisionedFieldBand` (+ tests) wired into `FieldsAdminPage` behind an outer Fields ↔ Relationships tab bar, `GenericRelatedRecordsTab` (+ tests), `RecordDetailPage` config-driven tab bar refactor with system-row-filtering (+ new test case), API `RelationshipsControllerTests` + `RecordLinksControllerTests` + `RelationshipsEndpointsTests` (31 tests total), and doc updates to `data-model.md` / `api-contracts.md` (§21 + two new error codes) / `module-boundaries.md` (§23) / `shared-inventory.md`. Nine decisions in [25-slice-relationships-schema.md](25-slice-relationships-schema.md) — the six session-1 decisions plus session-2 additions: (1) side panel exists but is NOT wired into the current single-column record detail layout; (2) the S30 outer tab bar landed inside `FieldsAdminPage` rather than a new wrapper page; (3) `IsSystem=1` seeded relationships are filtered *out* of the tab-bar injection because Request → Task models the existing base `TasksTab` (with typed fields + bundle templates that `GenericRelatedRecordsTab` doesn't carry).
- **Started:** 2026-07-16T13:15:00-04:00
- **Ended:** 2026-07-16T14:39:16-04:00
- **Duration:** 01:24:16

### Slice 26: Record Status/hold model + Status tab + per-record notification preferences
- **Spec section:** blueprint §Record detail behaviors (Status tab, Watchers & alerts). [v2-reconciliation.md §Model deltas 3, §API deltas Request Status/hold + Watchers, §Slice amendments].
- **User capability:** "a user sets the record's Status (In progress / On hold / Abandoned) from the Status tab; On hold pauses task completion and gate approvals; Abandoned marks the solution dropped and blocks all mutations. On the Watchers & alerts tab, the user configures per-record notification preferences (Gate decisions · Status changes · Task sign-offs · SLA & due-date reminders · Mentions & comments); the notification fan-out honors them."
- **Scope:**
  - **DB:** `Request.StatusHold` (tri-state) + `StatusHoldNote` — migration converts existing `Hold=1` rows to `StatusHold='OnHold'` and `Hold=0` rows to `StatusHold='InProgress'`; the binary `Hold` column is dropped in the same migration (or retained as a computed column for the compat window — decided at slice start). `WatcherNotificationPreference` table (§Model deltas 6).
  - **Procs:** guards added to `usp_CompleteTask`, `usp_DecideApproval`, `usp_SetRequestStage` — return 409 `record-on-hold` when the parent record's `StatusHold ∈ {'OnHold', 'Abandoned'}`. New `usp_UpsertWatcherPreference` + `usp_ListWatcherPreferences`.
  - **API:** extend `PATCH /requests/{id}` to accept `statusHold` + `statusHoldNote`; keep legacy `hold` shape for one release with server-side mapping. Extend `PATCH /records/{id}/watchers/me` for the five preference booleans. Task-complete / approval-decide / stage-transition endpoints return the new 409 code.
  - **Web:** S4 Status tab (segmented control + note textarea + inline alert when non-active); Watchers & alerts tab UI (toggle + five checkboxes); `StatusHoldPill` component on S2 rows, S4/S5 header, Home cards; `useHoldGuard` hook wraps every touched button. NotificationDeliveryService reads preferences before enqueue.
- **Screens covered:** **S4** `[prototyped]` (Status tab + Watchers & alerts tab).
- **Depends on:** 5, 8, 12.
- **Estimated LoC:** 3,500.
- **Locked-signature changes flagged:** `RequestDto.statusHold` (additive; existing `hold` retained as derived read); `WatcherListItemDto` gains five booleans (additive). Home types (`HomeWorkItem`, `HomeDecisionItem`, `HomeTriageItem`) gain an optional `statusHold` (additive; API projection is a follow-up — the UI reads it defensively and renders no pill when undefined).
- **Status: completed** — full scope landed across two sessions. Session 1 (2026-07-17T15:01:22–15:52 EDT): DB (migrations 060–062 + rollbacks; JSON `$.holdBlocked` / `$.holdReason` mirror retained per D1), 2 new procs (`usp_UpsertRequestStatusHold`, `usp_UpsertWatcherPreference`), hold guards added to `usp_PatchTask` / `usp_SubmitDecision` / `usp_SetRequestStage`, extensions to `usp_GetWatchers` (project caller preferences) + `usp_FanOutNotification` (per-category preference filter), API layer (RequestsService tri-state routing + pure `ResolveStatusHold`, WatchersService PatchMineAsync + pure `HasPreferenceEdit`, new `RecordOnHold` outcomes on Requests/Tasks/Approvals mapped to `record-on-hold` 409). Session 2 (2026-07-17T15:52–16:26 EDT): tSQLt tests (`test_StatusHold.sql` — 12 cases; `test_WatcherPreferences.sql` — 6 cases), xUnit (`RequestsResolveStatusHoldTests` — 7 cases; `WatchersPreferencesTests` — 8 cases; extensions to `RequestsControllerTests` / `ApprovalsControllerTests` / `WatchersControllerTests` / `WatchersEndpointsTests`), web primitives (`StatusHoldPill`, `useHoldGuard`, `useSetStatusHold`, `usePatchMyWatch`) with jest + jest-axe, S4/S5 Status tab tri-state segmented control + note textarea + inline alert, Watchers & alerts tab five per-record preference toggles gated on `isWatching`, `StatusHoldPill` wired on S2 rows / S4/S5 header meta / Home Work + Decisions + Triage cards, `useHoldGuard` wraps Move stage + gate Approve/Reject (via `paused` flag → `gateDisabled`), TasksTab paused banner copy updated to tri-state framing, doc updates (`data-model.md` / `api-contracts.md` / `shared-inventory.md`). Ten decisions (D1–D4 + six additional cut-plan decisions) recorded in [26-slice-status-hold.md](26-slice-status-hold.md).
- **Started:** 2026-07-17T15:01:22-04:00
- **Ended:** 2026-07-17T16:26:07-04:00
- **Duration:** 01:24:45

### Slice 27: Multiple lifecycles + Lifecycle picker at intake
- **Spec section:** blueprint §Approver teams & lifecycles (S31/S29). [v2-reconciliation.md §Model deltas 4, §API deltas Multi-lifecycle].
- **User capability:** "a workspace admin defines multiple lifecycles per workspace via the S31 dropdown selector (one marked default); the S3 intake form shows a Lifecycle picker (hidden when only one lifecycle exists); a submitted request runs on the chosen lifecycle for its whole life (no mid-flight lifecycle change)."
- **Scope:**
  - **DB:** `Lifecycle.IsDefault` + unique-filtered index guaranteeing exactly one default per workspace; `Lifecycle.DisplayLabel` (label used in the picker + everywhere in the UI, replacing the separate "Request type"). Migration flips existing single-per-workspace lifecycles to `IsDefault=1`.
  - **Procs:** `usp_SetDefaultLifecycle` (transactional — clears prior default, sets new). `usp_CreateLifecycle` (new). Existing `usp_UpsertLifecycle` accepts `DisplayLabel`.
  - **API:** `GET /workspaces/{id}/lifecycles` (list all); `POST /workspaces/{id}/lifecycles`; `PATCH /lifecycles/{id}`; `POST /lifecycles/{id}/set-default`. Extend `POST /workspaces/{id}/requests` to accept optional `lifecycleId`; when omitted, workspace default is used.
  - **Web:** S31 dropdown selector at the top of the lifecycle editor (list · New lifecycle · Set as default per row); S3 `LifecyclePicker` component (hidden when workspace has one lifecycle); intake form updated to write `lifecycleId` on create.
- **Screens covered:** **S31 Lifecycle & gates** `[prototyped]` (dropdown selector); **S3 Intake form** `[prototyped]` (picker addition).
- **Depends on:** 4, 5.
- **Estimated LoC:** 3,000.
- **Locked-signature changes flagged:** `LifecycleDto.isDefault` + `displayLabel` (additive). `RequestCreateRequest.lifecycleId` is already optional — no change.
- **Status: completed** — landed almost entirely as reconciliation: slice 4/5 had already shipped the multi-lifecycle DB (IsDefault + filtered unique index + `Requests.LifecycleId` FK), the defaulting create service, and a working S31 + intake picker, so slice 27 added **no migration**. What's new: (1) `RequestCreateRequest.lifecycleId` first-class + `RequestsService.ResolveLifecycle` precedence (explicit → legacy requestType → default → first); (2) a thin `GET /workspaces/{id}/lifecycles` list (reusing `usp_GetWorkspaceLifecycles`) + `LifecycleSummaryDto` + `useWorkspaceLifecycles`; (3) S31 chip-bar → prototype **dropdown** selector; (4) S3 "Request type" → **"Lifecycle"** picker (names, hidden when 1 lifecycle, writes `lifecycleId`). Four analyst decisions (D1 use `Name` not a new `DisplayLabel` column — `RequestType` retained + mirrored from `Name`; D2 skip the granular POST/PATCH/set-default endpoints — the full-config reconcile covers them; D3 `lifecycleId` first-class with `requestType` fallback; D4 defer PG-template lifecycle seed). No-mid-flight-change already enforced (`usp_SetRequestStage` reads `LifecycleId` off the record — verified, not rebuilt). API + Api.Tests build 0/0; web tsc/jest/Playwright deferred to the ship gate (no local `node_modules` — slices 15/16/21/23 precedent). See [27-slice-multi-lifecycle.md](27-slice-multi-lifecycle.md).
- **Started:** 2026-07-18T23:40:24-04:00
- **Ended:** 2026-07-19T00:04:41-04:00
- **Duration:** 00:24:17

### Slice 28: Multi-dashboard composer (S6 upgrade)
- **Spec section:** blueprint §Dashboards (S6 multi-dashboard). [v2-reconciliation.md §Model deltas 7, §API deltas Multi-dashboard composer].
- **User capability:** "a user opens the Dashboards surface and switches between Shared and Personal dashboards via a title dropdown; creates a new dashboard (name + visibility) via a side sheet; enters Edit layout mode to reorder / edit / remove widgets; adds a widget via a composer (type · metric or group-by · row limit · half/full width · dept + stage scope); the seeded AI Solutions default keeps its bespoke four-tile + heatmap + grid layout (not composable)."
- **Scope:**
  - **DB:** `SavedDashboard.IsSeeded`, `Visibility`, `LayoutMode` per §Model deltas 7. Migration marks the four Slice-23 seed rows `IsSeeded=1, LayoutMode='Fixed'`. Existing `WidgetLayoutJson` used as-is for the Composed mode.
  - **Procs:** `usp_CreateDashboard` (composed), `usp_PatchDashboardWidgets`, `usp_UpsertWidget`, `usp_DeleteWidget`. Guard: PATCH against a seeded dashboard returns 403 `seeded-dashboard-read-only`.
  - **API:** `POST /workspaces/{id}/dashboards` (composed create), `PATCH /dashboards/{id}`, widget CRUD per §API deltas. The metric-resolver engine from slice 23 handles Composed dashboards unchanged — the WidgetType palette + config schema is the shared contract.
  - **Web:** `DashboardSwitcher` component (Shared/Personal + New dashboard) at the top of S6; Edit layout mode on `DashboardSurface`; `WidgetComposer` side sheet driven by `WidgetTypeCatalog`. S32 Views & dashboards' management panel picks up the visibility/audience patch surface for composed dashboards.
- **Screens covered:** **S6 Dashboards** `[prototyped]` (multi-dashboard surface + composer).
- **Depends on:** 23.
- **Estimated LoC:** 5,500.
- **Locked-signature changes flagged:** `SavedDashboardDto.visibility` + `layoutMode` + `isSeeded` (additive). Seeded-dashboard read-only guard is a new response code, not a breaking change.
- **Status:** pending.

### Slice 29: Toolkit object + S43 surface
- **Spec section:** blueprint §At a glance (S43); §Save for /build (superseded — S43 is now prototyped); build spec §2.6 (Toolkit), §19 (Toolkit fields). [v2-reconciliation.md §Model deltas 5, §Module deltas Toolkit, §API deltas Toolkit].
- **User capability:** "an analyst opens the Reference → Toolkit surface, browses items in gallery or list view, creates a new item (paste content or upload attachment), downloads an existing item's attachment, and edits an item's fields in place. Items are scoped to the workspace (Local Workspace object, not federated). Item kinds: Playbook / Plugin / Prompt."
- **Scope:**
  - **DB:** `ToolkitItem` table per §Model deltas 5. Seed the five system-provisioned fields for the new object. Register `'ToolkitItem'` as an object in the workspace object registry (`Show-in-left-sidebar=1, SidebarCategory='Reference'`).
  - **Procs:** `usp_QueryToolkit`, `usp_UpsertToolkitItem`, `usp_RetireToolkitItem`, `usp_RestoreToolkitItem`. `usp_ProvisionWorkspace` extends to seed the Toolkit object for new workspaces (no seed items).
  - **API:** `/api/v1/workspaces/{id}/toolkit` + `/api/v1/toolkit/{id}` per §API deltas Toolkit. Attachment download via existing Attachments module (module 11) — Toolkit items with an uploaded body route through the shared attachment blob path.
  - **Web:** new `features/toolkit/` module; `ToolkitSurface` shell reusing the shared list-surface pattern; gallery/list toggle; New item side sheet (paste-or-upload); edit-in-place fields; sidebar Reference → Toolkit entry (already stubbed in slice 2's grouped nav).
- **Screens covered:** **S43 Toolkit** `[prototyped]`.
- **Depends on:** 3, 11, 25 (Relationships schema engine — Toolkit is registered as an object via the extended objects endpoint).
- **Estimated LoC:** 4,500.
- **Locked-signature changes flagged:** `FieldObjectType` gains `'ToolkitItem'` (additive union); new `ToolkitItemDto` (new file); new `ToolkitItemId` branded id (additive to `common.ts`).
- **Status:** pending.

### v2 amendments to existing slices (in-plan follow-ups)

*Small polish tasks against surfaces slices already own. Recorded here for reviewer visibility; picked up either by whoever next touches the surface, or as small dedicated PRs against the impacted slice.*

- **Slice 2 (Auth & app shell):** grouped Workspace/Platform settings IA. Sidebar Admin group replaces the flat six-item list with two grouped entries (Workspace with `gear`, Platform with `shield-check` — platform-admins only). `/settings/workspace/:page` + `/settings/platform/:page` router; platform routes guard on the platform-admin claim (returns S40 no-access if absent). Secondary side-nav in the settings body per blueprint §Cross-cutting → Settings surface.
- **Slice 13 (Announcements):** `ScheduledPublishAt` + `AutoArchive` + `AutoArchiveAt` on `Announcement`; scheduler wired off the Phase 2 SLA/tick worker; S23 editor gains publish-date picker + auto-archive toggle + computed archive date preview.
- **Slice 16 (CSV Import & Export):** Import wizard UI polish per blueprint S28 (target object · drop CSV/Excel · auto-map with per-column overrides · Skip · row count · Import rows). No API change.
- **Slice 17 / 18 / 19 (admin surfaces):** router-path change from `/admin/:page` → `/settings/workspace/:page` (workspace pages) or `/settings/platform/:page` (platform pages) per Slice 2 v2 polish. Components unchanged; only URLs and sidebar entries move.
- **Slice 18 / 19 (audit surfaces):** structured `Object` + `Record ID` columns on S33 workspace audit and S39 platform audit. Projection extends `usp_QueryWorkspaceAudit` + `usp_QueryFirmWideAudit` (map `EntityType` → object label; map `EntityId` → Record ID display for Request rows). `AuditLogRowDto` gains `objectLabel` + `recordDisplayId` (additive).

---

## Screens explicitly out of scope for Release 1

None. Every screen in the blueprint's 43-screen master table is covered by a Release 1 slice above (slices 1–29 + amendments).

Release 2 introduces email delivery + digests, time-based triggers (Benefit-review prompt, proactive SLA-breach alerts), the REST API + webhooks, the AI-assist layer, the DMS / SharePoint connector, and any full request-template automation not covered by the R1 admin surfaces. Those are new slices when Release 2 is planned — none of the above 29 R1 slices ship them. **Toolkit build + no-code dashboard composer moved into R1 Phase 2 via the 2026-07-07 re-phasing and land here as Slices 29 and 28 respectively.**

---

## Drift cap — declared verbatim

> **slice count cannot grow by more than 25% during Step 3 without an architecture-doc update and a re-review.**

25% of **29** → cap of **36** slices under drift (updated 2026-07-16 with the v2 reconciliation raise from 24 → 29 targets; original 24 → 30 drift cap superseded). Any slice added mid-build must be traced back to a spec section not covered by an existing slice. If a candidate slice appears to duplicate an existing one, merge it in rather than adding a new one. When the drift cap is reached, we stop, update this doc, and re-review before continuing.

---

## Cross-check against requirements

| Requirements section | Covered by slice(s) |
|---|---|
| §3 The Request (workflow, before/after) | All record slices (5, 7, 8, 9, 10) + Home (22) + dashboards (23) |
| §4 Data & Inputs (Confidential + PII) | Slice 1 (audit + PII discipline in schema), every slice observes the logging + no-log-PII rule |
| §5 User Stories | 9 stories → mapped: PG requestor (3, 5, 9); PG admin (5, 9, 10, 17); AI Analyst (5, 7, 8); AI Manager (23); Gate approver (8, 22); Business Owner (12); Watcher (12); Any firm user (14, 23); Platform admin (17, 19, 24) |
| §5 Testable Acceptance Criteria (13 rows) | Each row is a test the slice that ships that behavior must pass — enumerated in each slice's coverage above |
| §5 Use Cases 1–5 | UC1 escalation → slice 9; UC2 gates → slice 8; UC3 reuse → slice 14; UC4 closure/Copy → slice 10; UC5 CSV migration → slice 16 |
| §6 Constraints | Cross-cutting; observed by every slice per the rules |
| §7 Users, Administration & Reporting | Reporting → 21, 22, 23; User Management → 17; Admin operations → 18, 19 |
| §9 Approvals Required | Slice 8 (in-record) + slice 4 (config surface) |
| §10 Timeline | This slice plan realizes the R1 phases |
| §11 Instructions for Claude | Governs how every slice is executed; see the standing rules |

## Cross-check against dependency graph

Every module named in `module-boundaries.md` (extended by the v2 addendum) maps to at least one slice above. Verified:

- Platform & Shell → slice 1, 2 (+ v2 grouped-settings polish). Fields & Objects → 3 (+ v2 slice 25 extensions). Lifecycle & Gates → 4 (+ v2 slice 27 multi-lifecycle). Requests → 5 (+ v2 slice 26 status/hold). Tasks → 7 (+ v2 slice 26 hold-guard). Approvals → 8 (+ v2 slice 26 hold-guard). Escalation → 9. Feature Catalog → 14. Announcements → 13 (+ v2 scheduling polish). Attachments → 11. Watchers → 12 (+ v2 slice 26 preferences). Comments & Activity → 6. Typed Links → 10. Saved Views → 14. Dashboards → 23 (+ v2 slice 28 composer). Notifications & Bell → 12 (+ v2 slice 26 preference-aware fan-out). Search → 15. Import/Export → 16 (+ v2 wizard polish). Audit → 1 (schema) + 18 (surface) + 19 (firm-wide, + v2 structured columns). Event Spine → 1 (core) + every state-changing slice. Home Surface → 22. Platform Admin → 19 (+ 24 editable crossing map). Workspace Admin (Users/Views/Audit) → 17, 18. Error/Empty UI → 20. **Relationships (new v2 module)** → slice 25. **Toolkit (new v2 module)** → slice 29.

No module is orphaned. No slice references a module not in the graph. Two new modules (Relationships, Toolkit) join the graph as leaves — see [v2-reconciliation.md §Dependency-graph deltas](v2-reconciliation.md).
