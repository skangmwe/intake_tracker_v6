# Slice Plan — AI Solutions Tracker

*The locked contract for build cadence. Ships Release 1 (Phase 1 + Phase 2) as one coherent plan. Release 2 (Phase 3 + Phase 4) is scoped separately in the build spec (§15) and is out of scope here.*

## Ceiling and target

- **Target slice count:** 24 slices for R1 (Phase 1 = 20, Phase 2 = 4). The build spec ships ~17 top-level user capabilities across Phase 1 + Phase 2 (see requirements Section 5), so 24 sits at ~1.4× — well within the 1–3× guidance from `slicing.md`.
- **Reviewable LoC ceiling per slice: 6,000 lines.** Reasoning: this is a Tier 3 enterprise application (identity + multi-workspace + audit + escalation + gates). Security-critical concerns argue for lower; greenfield CRUD argues for higher. 6,000 balances the two. Foundation + admin + escalation slices are expected to run near the ceiling; edge-states + edge-admin slices sit around 1,500–2,500.
- **Drift cap:** _slice count cannot grow by more than 25% during Step 3 without an architecture-doc update and a re-review._ 25% of 24 → 30 slices max under drift; anything above triggers a re-review.

## Design-handoff coverage

Every in-scope screen in [`full-design-blueprint.md`](../../design/full-design-blueprint.md) is reachable from a slice. Prototyped screens (S1, S2, S3, S4, S5, S6, S31) are tagged `[prototyped]`; deferred screens are tagged `[deferred]` and are built from the blueprint's per-screen spec.

No screen is silently dropped. Every out-of-scope screen is called out at the bottom.

## Slice-order dependencies

Foundation (1) → Auth & shell (2) → Fields & objects + platform field schema (3) → Lifecycle & gates admin (4) → Requests core (5) → satellite record modules (6–15) → workspace admin (16–18) → platform admin (19) → edge states (20). Then Phase 2 additions (21–24).

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

### Slice 14: Feature Catalog (S9, S10, S13) + Saved-view editor (S24)
- **Spec section:** BS §2.5 (Feature Catalog), §18 (schema), §22.3-22.4 (saved-view picker and editor).
- **User capability (1):** "I can browse the Feature Catalog list, open a feature detail, and harvest a Feature draft from a shipped Request via Add-to-catalog; on submit the platform stamps a `sourced-from` link back."
- **User capability (2):** "I can author or edit a saved view via a tabbed side sheet — Filters (row-based `field + comparator + value` builder ANDing together), Fields (shuttle for columns + order), Sort (reorderable rows)."
- **Scope:** DB `Features` table. API: `/features/*`, `/requests/{id}/add-to-catalog`, `/saved-views/*`. Web: **S9 Feature catalog** `[deferred]`, **S10 Feature detail** `[deferred]`, **S13 Add to catalog** `[deferred]`. **S24 Saved-view editor** `[deferred]` — the tabbed side sheet with the condition-engine-surfaced Filters builder, Fields shuttle, Sort rows, personal/shared scope toggle, default-view toggle. Wire the S2 saved-view picker's Modify/Edit/Save-as-new actions to the editor.
- **Screens covered:** **S9**, **S10**, **S13**, **S24** all `[deferred]`.
- **Depends on:** 3 (saved views need field definitions), 5 (Add-to-catalog reads a shipped Request), 10 (typed link creation).
- **Estimated LoC:** 5,500.

### Slice 15: Search
- **Spec section:** BS §9.5 (search — access-respecting, no OCR, Legacy ID searchable).
- **User capability:** "the top-bar workspace search returns up to 6 records matching my query; a full Search Results surface shows access-respecting hits across fields, comments, and attachment filenames — with snippets and match-kind (record/comment/attachment)."
- **Scope:** SQL Server full-text index refreshed via triggers (or scheduled ETL if trigger latency is unacceptable — decided at implementation time). API: `GET /search`, `POST /search/full`. Web: top-bar workspace-search popover (replaces the stub from slice 2); **S27 Search results** `[deferred]`.
- **Screens covered:** top-bar workspace-search popover `[prototyped]`; **S27 Search results** `[deferred]`.
- **Depends on:** 5, 6.
- **Estimated LoC:** 3,000.

### Slice 16: CSV Import & Export
- **Spec section:** BS §13 (Import, export, and the API).
- **User capability:** "a workspace admin uploads a CSV to create records (never update), receives a per-row validation report — landed rows plus flagged rows with reasons; Requestor resolves via SSO or falls back to the importing admin with a flag. Export View button on every items list exports the active saved view (columns follow the view, rows follow the caller's entitlements)."
- **Scope:** Worker-hosted import processor. `usp_MintRecordId` called per row from Worker (concurrent with in-app minting — same counter, no collisions per BS §6.7). API: `POST /workspaces/{id}/imports/csv` (multipart, streaming), `GET /imports/{id}`, `POST /exports`. Web: **S28 Import & export** `[deferred]`. Wire the Export View button on every items list.
- **Screens covered:** **S28 Import & export** `[deferred]`; Export View buttons on S2 (and later S9, S22, audit logs).
- **Depends on:** 1, 3, 5.
- **Estimated LoC:** 4,500.

### Slice 17: Users & access admin
- **Spec section:** BS §4.2 (access levels), §6.8 (deactivation and reassignment).
- **User capability:** "a workspace admin manages membership — assigns Viewer/Member/WorkspaceAdmin level, deactivates users. Deactivation with a pending named-individual sign-off is blocked; open owned or assigned records don't block deactivation but notifications to disabled accounts are suppressed."
- **Scope:** API: `POST /workspaces/{id}/members`, `DELETE /workspaces/{id}/members/{userId}`. Enforce the §6.8 safety floor. Web: **S29 Users & access** `[deferred]`.
- **Screens covered:** **S29 Users & access** `[deferred]`.
- **Depends on:** 2.
- **Estimated LoC:** 2,500.

### Slice 18: Views & dashboards admin + workspace audit
- **Spec section:** BS §10.2 (audience two-layer), §10.5 (workspace locality), §12 (audit surfaces).
- **User capability (1):** "a workspace admin manages shared saved views and shared dashboards for their workspace — audiences, defaults, promote from personal."
- **User capability (2):** "a workspace admin reads their own workspace's audit log — chronological event list filtered by date / actor / record / event type."
- **Scope:** API: `/workspaces/{id}/dashboards`, `PATCH /saved-views/{id}` shared-scope permissions, `/workspaces/{id}/audit/query`. Web: **S32 Views & dashboards** `[deferred]`, **S33 Workspace audit** `[deferred]`.
- **Screens covered:** **S32**, **S33** both `[deferred]`.
- **Depends on:** 14, 1 (audit table).
- **Estimated LoC:** 3,500.

### Slice 19: Platform admin — crossing map (read-only seed), access, role-labels, workspace provisioning, firm-wide audit
- **Spec section:** BS §4.3 (Platform admin), §6.2 (crossing map — R1 Phase 1 read-only seed), §7.2 (role-label catalog), §1.1 (workspace provisioning — R1 Phase 1 out-of-band).
- **User capability:** "a Platform admin manages firm-wide config: reads the seeded crossing map (editing is R1 Phase 2 — see slice 24), manages platform-admin grants and workspace-admin holders, edits the role-label catalog (Manager / PG Lead / GCO / InfoSec / Data Privacy, extensible), provisions new workspaces (out-of-band clone in Phase 1), and reads the firm-wide audit log."
- **Scope:** DB tables `CrossingMap`, `RoleLabelCatalog`, `PlatformAdminGrant`. API: `/platform/crossing-map` (GET only in Phase 1), `/platform/role-labels` (CRUD), `/platform/access` (CRUD), `POST /api/v1/workspaces` (server-side clone from PG/Dept template — used by ops tooling in Phase 1 and by S38's in-app wizard in Phase 2), `/platform/audit/query`. Web: **S34 Field schema** was built in slice 3 (kept as `[deferred]` from a UI-completion perspective in this slice — polish or ship as-is); **S35 Crossing map** `[deferred]` (read-only in Phase 1 — displays the seeded map). **S36 Access provisioning** `[deferred]`. **S37 Role-label catalog** `[deferred]`. **S38 Workspace provisioning** `[deferred]` (Phase 1 = API only; the wizard UI lands in slice 24). **S39 Firm-wide audit** `[deferred]`.
- **Screens covered:** **S35**, **S36**, **S37**, **S38** (API only), **S39** all `[deferred]`.
- **Depends on:** 1, 2, 3, 17.
- **Estimated LoC:** 5,000.

### Slice 20: Error / empty edge states (S40, S41, S42)
- **Spec section:** `loading-empty-and-error-states.md` + BS §22.6 (no-access response).
- **User capability:** "when I follow a link to a record I can't see, I get a no-access response that never reveals record existence; when a workspace is empty, I get a Zero-data empty state with a 'Create your first request' CTA; when my filters exclude all rows, I get a bordered card 'No matches for these filters' with a 'Clear filters' secondary CTA."
- **Scope:** shared web components `NoAccessPage`, `EmptyListZeroData`, `EmptyListFilteredToZero`. Wire into every list surface (S2 / S9 / S22 / audit logs / dashboards' embedded grid) and every record-detail route.
- **Screens covered:** **S40**, **S41**, **S42** all `[deferred]`.
- **Depends on:** 2.
- **Estimated LoC:** 1,500.

---

## Release 1 · Phase 2 — workspace usability

### Slice 21: Current-date + date-difference primitive + SLA Status
- **Spec section:** BS §3.1 (current-date reference), §3.3 (calculation stays numeric-only), §10.6 (cycle-time and time-in-stage), §17.2 (SLA Status).
- **User capability:** "records show aging tint on the Requests list, live time-in-stage on the Record detail, and SLA Status (On track / Due soon / Overdue) derived from Due Date."
- **Scope:** Condition-engine extension — current-date reference. Date-difference primitive (elapsed time between two dates or a date and current-date). SQL side: computed columns for `TimeInStage`, `SlaStatus` where possible; view functions for the rest. Web: aging tint applied to every list row driven by SLA Status; time-in-stage display in Record detail meta strip. The "due soon" window is a workspace-level config value.
- **Screens covered:** aging tint on S2 and every save-for-/build list surface `[prototyped]`; SLA Status pill on S4/S5 `[prototyped hooks]`.
- **Depends on:** 5.
- **Estimated LoC:** 3,000.

### Slice 22: Home surface (S1 — prototyped)
- **Spec section:** BS §10.7 (Home surface). Requirements user-story panel list.
- **User capability:** "when I sign in I land on Home — a per-user landing composing viewer-scoped queries into panels: Needs your decision · Your work today · Since you were last here · New to triage · Pinned announcements. Quick-create and Pin-as-home affordances round it out."
- **Scope:** `current-user` reference in the condition engine. API: `GET /home` composite endpoint. Web: **S1 Home** `[prototyped]` — the four viewer-scoped-query panels, the pinned-announcement slim strip at the top, and the "Pin as home" affordance next to the page heading. Quick-create is scoped to the Requests list per prototype changelog (top-bar quick-create was replaced by workspace search in slice 15; no top-bar quick-create in Phase 2 either).
- **Screens covered:** **S1 Home** `[prototyped]`.
- **Depends on:** 21, 5, 6, 8, 12, 13.
- **Estimated LoC:** 5,500.

### Slice 23: Seeded dashboards — AI Solutions default (S6), Workload (S14), Feature Catalog (S12); Dashboards list + PG starter + Dashboard-viewer surface
- **Spec section:** BS §10.2 (widget palette), §10.3 (AI Solutions default), §10.3.1 (Workload), §10.3.2 (Feature Catalog dashboard), §10.4 (Dashboard-viewer), §10.5 (starter dashboards and locality).
- **User capability:** "the AI Solutions Manager and analysts have three seeded fixed-layout dashboards + a Dashboards list; PG workspaces have a starter dashboard; firm-wide viewers can consume the Feature Catalog dashboard read-only via the Dashboard-viewer surface."
- **Scope:** Widget-type implementations (KPI tile, KPI-with-trend, segmented bar, bar breakdown, histogram, line-timeseries, heatmap matrix, records grid) — data queries per-widget, each access-respecting. API: `GET /workspaces/{id}/dashboards`, `GET /dashboards/{id}`. Web: **S6 AI dashboard** `[prototyped]` — the four-uniform-tiles Row 1 + full-width heatmap Row 2 + records grid Row 3 layout. **S14 Workload dashboard** `[deferred]`, **S12 Feature Catalog dashboard** `[deferred]`, **S15 PG starter dash** `[deferred]`, **S17 Dashboards list** `[deferred]`, **S16 Dashboard viewer** `[deferred]` (no-rail surface bound to one dashboard).
- **Screens covered:** **S6** `[prototyped]`; **S12**, **S14**, **S15**, **S16**, **S17** all `[deferred]`.
- **Depends on:** 21, 5, 14 (saved views drive records-grid widget).
- **Estimated LoC:** 6,000.

### Slice 24: Advanced views + self-serve workspace provisioning + admin-editable crossing map
- **Spec section:** BS §10.5 (advanced views incl. gallery), §15 Phase 2 (self-serve workspace provisioning, admin-editable crossing map).
- **User capability:** "workspace admins can use advanced views — Kanban, timeline, gallery (feeds S11), agenda — on their surfaces; Platform admins provision new workspaces via an in-app self-serve wizard; the crossing map is admin-editable via a propose (PG side) / confirm (AI side) workflow with type-compat and option-set checks."
- **Scope:** Advanced view rendering (Kanban / timeline / gallery / agenda). Wire S11 Feature gallery (uses gallery view). API: `POST /platform/crossing-map` (propose) + `PATCH /platform/crossing-map/{id}` (confirm). Web: **S11 Feature gallery** `[deferred]`, updated **S35 Crossing map** UI (propose/confirm workflow), **S38 Workspace provisioning** wizard UI.
- **Screens covered:** **S11 Feature gallery** `[deferred]`; **S35 Crossing map** (Phase 2 upgrade) `[deferred]`; **S38 Workspace provisioning** UI `[deferred]`.
- **Depends on:** 14, 19.
- **Estimated LoC:** 4,500.

---

## Screens explicitly out of scope for Release 1

None. Every screen in the blueprint's 42-screen master table is covered by a Release 1 slice above.

Release 2 introduces the Toolkit (§2.6 / §19), the no-code dashboard builder (§10.2 builder surface), request templates (§9.7 admin UI + full templating), email delivery + digests, time-based triggers (Benefit-review prompt, proactive SLA-breach alerts), the REST API + webhooks, the AI-assist layer, and the DMS / SharePoint connector. Those are new slices when Release 2 is planned — none of the above 24 slices ship them.

---

## Drift cap — declared verbatim

> **slice count cannot grow by more than 25% during Step 3 without an architecture-doc update and a re-review.**

25% of 24 → cap of 30 slices under drift. Any slice added mid-build must be traced back to a spec section not covered by an existing slice. If a candidate slice appears to duplicate an existing one, merge it in rather than adding a new one. When the drift cap is reached, we stop, update this doc, and re-review before continuing.

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

Every module named in `module-boundaries.md` maps to at least one slice above. Verified:

- Platform & Shell → slice 1, 2. Fields & Objects → 3. Lifecycle & Gates → 4. Requests → 5. Tasks → 7. Approvals → 8. Escalation → 9. Feature Catalog → 14. Announcements → 13. Attachments → 11. Watchers → 12. Comments & Activity → 6. Typed Links → 10 (plus surfaces on many). Saved Views → 14. Dashboards → 23. Notifications & Bell → 12. Search → 15. Import/Export → 16. Audit → 1 (schema) + 18 (surface) + 19 (firm-wide). Event Spine → 1 (core) + every state-changing slice (emitters). Home Surface → 22. Platform Admin → 19 (+ 24 for editable crossing map). Workspace Admin (Users/Views/Audit) → 17, 18. Error/Empty UI → 20.

No module is orphaned. No slice references a module not in the graph.
