# API Contracts — AI Solutions Tracker

*Endpoints, request/response shapes, error contract. Everything traces to a `solution-requirements.md` section or a build-spec (**BS**) chapter. Full DTOs live in `/shared/types/` (see `shared-types.md`); this doc names them without repeating the field lists.*

## Universal contract

- **Base URL:** `/api/v1/` (no API versioning per `api/CLAUDE.md`; the `/v1/` is a stable prefix, not a versioning axis).
- **Auth:** every endpoint requires an Entra ID bearer token except `GET /health`. Token validation via `Microsoft.Identity.Web` (`api-auth.md`).
- **Origin:** every request must arrive via Azure Front Door — validated in-process by the `X-Azure-FDID` header when configured (`api-auth.md`).
- **User provisioning:** `EnsureUserMiddleware` upserts the user row on first authenticated request. Clients never call a `/register` endpoint.
- **Correlation:** every request gets an `X-Operation-Id` header (generated if absent). Echoed on the response. Propagated through Service Bus.
- **Cache-Control:** every authenticated endpoint sets `Cache-Control: private, no-store` by default (`api-coding-standards.md` — AFD lockdown rule). Overridden only for genuinely public lookup endpoints (none in scope for R1).
- **Errors:** RFC 7807 ProblemDetails. Plain-language `detail`. **Never** exposes stack traces, exception messages, or internal identifiers. `errors` extension holds field→messages for validation failures. See `api-error-handling.md`.
- **Pagination:** collection endpoints accept `{ page: 1, pageSize: 20, filters: {} }` in POST body; return `{ items, totalCount, page, pageSize }`. Default 20, max 100.
- **Access resolution:** every read resolves to the viewer's entitlements at query time. No list, search, filter, or export widens access.
- **`403` vs `404`:** ownership violations return `403`, **never** `404`. Non-existence is never disclosed for out-of-scope records (BS §22.6).
- **Cancellation:** every controller passes the `CancellationToken` down through the stack (`api-coding-standards.md`).

## Status code conventions

| Code | Meaning here |
|---|---|
| `200` | Success; body carries payload. |
| `201` | Resource created; `Location` header points at the new resource. |
| `202` | Accepted — enqueued to Worker (currently only used for CSV import). |
| `204` | Success; no body. Used for stubs like watcher toggle. |
| `400` | Validation failure. ProblemDetails `errors` field populated. |
| `401` | Missing/invalid/expired token. |
| `403` | Authenticated but not entitled (ownership, level, cross-workspace). |
| `404` | Resource genuinely not found *and* the caller would be entitled to see it. Never used to mask a `403`. |
| `409` | Conflict — duplicate escalation, filename collision, ETag mismatch on Blob update. |
| `429` | Rate limited (AFD-imposed). |
| `500` | Unhandled — logged with OperationId, generic response body. |
| `502` | Upstream service unavailable after SDK-level retry (Blob, Service Bus). |

---

## 1 · Auth, identity, health

### `GET /health`
Anonymous. No dependencies. Always 200 with `{ status: 'ok', version: <build id> }`.

### `GET /api/v1/users/me`
Returns the caller's identity plus every workspace membership.

- **Response:** `MeDto` — `{ user: UserDto, memberships: WorkspaceMembershipDto[], isPlatformAdmin: boolean }`.

### `POST /api/v1/users/me/theme`
Persist theme preference (light/dark).

- **Body:** `{ theme: 'light' | 'dark' }`.
- **Response:** `204`.

---

## 2 · Workspaces

### `GET /api/v1/workspaces`
List workspaces the caller is a member of. Response resolves to memberships the caller can see.

- **Response:** `WorkspaceListItem[]` — `{ id, name, kind, prefix, level }`.

### `POST /api/v1/workspaces` — Platform admin only (Slice 19; wizard UI slice 24)
Provision a new PG/Dept workspace by cloning the template (`usp_ProvisionWorkspace`).

- **Body:** `WorkspaceProvisionRequest` — `{ name, prefix, initialAdminUserId }`. Prefix is upper-cased and must be globally unique (validated against `Workspaces` **and** `PrefixRegistry`).
- **Response:** `201 → WorkspaceProvisionResult` — `{ id, name, kind, prefix }`. *(Slice 19: a focused result, not the member-less `WorkspaceDto` first sketched — the Platform-admin caller isn't necessarily a member, so a `level` field is meaningless. The clone copies the template's field schema; the template has no lifecycle, so a fresh workspace has none until S31.)*
- **Errors:** `409 duplicate-prefix` on prefix collision; `400` on blank name/prefix or an unknown/inactive initial admin; `503` when the PG/Dept template workspace is not provisioned.

### `GET /api/v1/workspaces/{id}/members` — Workspace admin (Slice 17)
The S29 members list. Members with SSO identity, level, last-active, and disabled state.

- **Response:** `MembersListDto` — `{ members: WorkspaceMemberDto[] }` where `WorkspaceMemberDto = { userId, displayName, email, level, isDisabled, lastActiveAt }`.
- **Errors:** `403` — caller is not a WorkspaceAdmin of the workspace (the list exposes member PII, so it is admin-only — the S29 audience).

### `POST /api/v1/workspaces/{id}/members` — Workspace admin
Add/edit membership.

- **Body:** `MembershipUpsertRequest` — **`{ userId?, email?, level }`, exactly one of `userId` / `email`** (Slice 17 refinement of the original `{ userId, level }` — R1 has no user-directory endpoint, so the S29 "Add member" affordance resolves a typed **email** server-side against active platform users; `userId` still changes an existing member's level). Resolution mirrors `usp_AddApproverTeamMember`.
- **Response:** `204`.
- **Errors:** `400` — unresolved / ambiguous email, both-or-neither of `userId`/`email`, or invalid level. `403` — not a WorkspaceAdmin.

### `DELETE /api/v1/workspaces/{id}/members/{userId}` — Workspace admin
Deactivate. Sets `Users.IsDisabled = 1` (BS §6.8 — "the account is disabled immediately"; notifications to disabled accounts are suppressed by the slice-12 fan-out) and soft-deletes the member's membership in this workspace. `409` if the target has a pending named-individual sign-off (BS §6.8). Team-slot sign-offs don't block. Idempotent. `403` — not a WorkspaceAdmin.

> **Slice 17 build note.** In the team-only slot model (slice 4 reconciliation) no gate slot names an individual, so the `409` block is structurally present (`usp_DeactivateMember` scans `ApprovalRequests.FrozenApproverSet` for a slot `namedUserId`) but never fires in Phase 1 — being a sole eligible team member does not block deactivation. Deactivation removes the caller's membership **in this workspace** while the account-disable is firm-wide; other-workspace memberships remain but the disabled account cannot sign in or receive notifications.

---

## 3 · Requests — CRUD and lifecycle

### `POST /api/v1/workspaces/{id}/requests`
Create a new Request in a workspace. Mints an ID from that workspace's prefix + sequence atomically.

- **Body:** `RequestCreateRequest` — content-field values per BS §17 [S] set + optional queued typed links from the intake similar-requests nudge (BS §9.8).
- **Response:** `201 → RequestDto`. `Location: /api/v1/requests/{id}`.
- **Errors:**
  - `400` — validation. Client number required when Dept/PG/Client = Client (BS §3.5). Business Value / Efficiency Gain / Level of Effort must be 1–5 integers.
  - `403` — caller not a member of the target workspace.

### `GET /api/v1/workspaces/{id}/requests` — the Requests list
POST-body pagination (`api/CLAUDE.md` rule) exposed as a POST for reasons of filter complexity.

Actually — **use `POST /api/v1/workspaces/{id}/requests/query`** to allow arbitrary filter payloads without query-string ceremony.

- **Body:** `RequestListQuery` — `{ page, pageSize, filters, sort, savedViewId? }`. Filters is a `Record<string, FilterClause>`. Sort is `Array<{ column, direction }>`. When `savedViewId` is set, the view's filters/sort/columns compose with any inline overrides.
- **Response:** `PaginatedResponse<RequestListRow>` — one row per Request with only the view's columns projected (never a wider set — BS §22.4 boundary rule).
- **Errors:**
  - `403` — caller not a member of the workspace.

### `GET /api/v1/workspaces/{id}/requests/similar?query={q}` — intake nudge (Slice 6)
Up to 3 access-respecting matches for the similar-requests panel (BS §9.8). Viewer+.

- **Response:** `SimilarRequestDto[]` — `{ id, name, stage, origin }`, ordered by match relevance then recency.
- **Matching:** LIKE-based token-overlap on Name + Description, workspace-scoped (a match never crosses a workspace — BS §9.5). Not full-text — the dev/test stack (LocalDB) has no Full-Text component; the real full-text Search surface is slice 15.
- **Errors:** `403` — caller not a member of the workspace.

### `GET /api/v1/requests/{recordId}`
Return the full record from **the workspace the caller has access to** (PG side if they're on the PG workspace; AI side if on the AI Solutions workspace). Escalated records have two rows; this returns the caller-side one.

- **Response:** `RequestDto` — includes lifecycle fields, all field values, side-panel data (typed links, attachments, watchers), and a `bridge` block when escalated (see §4 below).
- **Errors:**
  - `403` — caller cannot see this record on their side.

### `PATCH /api/v1/requests/{recordId}`
Partial update of editable content fields **and** the tri-state Status/hold (Slice 26). A single PATCH may combine content edits with a status change; content and status writes run sequentially inside the endpoint.

- **Body:** `RequestPatchRequest` — sparse map of field values plus optional `statusHold` (`'InProgress' | 'OnHold' | 'Abandoned'`) and `statusHoldNote`. The legacy `hold: { held, reason }` shape is accepted for one release and mapped server-side (`held=true → OnHold`, `held=false → InProgress`); `statusHold` wins when both are present.
- **Response:** `200 → RequestDto` (fresh state — includes updated `statusHold` + `statusHoldNote` and the derived legacy `hold` block).
- **Errors:**
  - `403` — insufficient level, or the field is locked (PG-side crossing field on an escalated record; the platform-defined `AI Solutions Status` at any access level).
  - `409` — optimistic concurrency: If-Match ETag mismatch. Client refetches and reapplies per `web-state-management.md`.

### `POST /api/v1/requests/{recordId}/stage`
Advance stage. Fires any configured gate; opens an ApprovalRequest if approvals are pending.

- **Body:** `{ toStage: string }`.
- **Response:** `200 → StageTransitionResult` — either `{ advanced: true, newStage }` or `{ advanced: false, gateOpened: ApprovalRequestDto }`.
- **Errors:**
  - `403` — level.
  - `409 gate-already-open` — a gate is already open on this record.
  - `409 record-on-hold` — the record's `statusHold` is `OnHold` or `Abandoned` (Slice 26). The UI reactivates via PATCH `statusHold: 'InProgress'` before retrying.

### `POST /api/v1/requests/{recordId}/hold` — **deprecated (Slice 26)**
Legacy binary hold — accepted for one release; superseded by `PATCH /requests/{id}` with `statusHold`. The endpoint now translates `held: true` → `statusHold: 'OnHold'` and `held: false` → `statusHold: 'InProgress'` and writes through `usp_UpsertRequestStatusHold` so column + JSON mirror stay consistent.

- **Body:** `{ held: boolean, reason?: string }`.
- **Response:** `204`.

### `POST /api/v1/requests/{recordId}/close`
Close with an Outcome.

- **Body:** `RequestCloseRequest` — `{ outcome: 'Live' | 'Declined' | 'Withdrawn' | 'Duplicate' | 'NotPursued', notes: string, duplicateOfRecordId?: string }`. `duplicateOfRecordId` required when Outcome = Duplicate.
- **Response:** `200 → RequestDto`.
- **Business rules:** Closure fires the closure event across the bridge (BS §11.2), notifying Requestor + Business Owner + Watchers on both sides. `AI Solutions Status` updates automatically.

---

## 4 · Escalation

### `POST /api/v1/requests/{recordId}/escalate`
Escalate a PG-side Request to the AI Solutions workspace. **One-time, one-way** (BS §6.6) — 409 if already escalated.

- **Body:** `EscalateRequest` — `{ confirmPendingEdits: boolean }`. When any crossing field has uncommitted edits, the API returns `400 { detail: "Pending edits on crossing fields must be committed first", errors: {…} }` unless the client explicitly confirms.
- **Response:** `201 → EscalateResult` — `{ recordId, aiWorkspaceId, aiRecord: RequestDto }`.
- **Business rules:**
  - Snapshot each mapped crossing field's current value into the AI-side row.
  - Adopt the PG-side `RecordId` on the AI-side row (shared key).
  - Lock PG-side crossing fields (set the `LockedAtEscalation` flag).
  - Emit `escalation.opened` on the event spine — the mirror update, notification fan-out to the seeded AI Intake group, and audit entry all flow from that.
  - Attachments follow the record (BS §6.3) — carried to the AI side; PG keeps a read-only copy.
- **Errors:**
  - `403` — caller cannot escalate this record (must be a member of the PG workspace).
  - `409 { detail: "This record has already been escalated" }` on re-escalation.
  - `400` — missing required crossing field.

**There is no de-escalation endpoint.** A mistaken escalation is resolved by closing the AI-side record with a reason (BS §6.6).

**The bridge block on `RequestDto` (escalated records only):**
```
bridge: {
  isEscalated: true,
  originWorkspaceId: string,       // the PG workspace
  originWorkspaceName: string,     // resolved via prefix registry
  aiWorkspaceId: string,
  escalatedAt: IsoDateTime,
  aiSolutionsStatus: string,       // the mirror value — read-only for everyone at every level
  lockedFields: string[]           // field IDs frozen on the PG side
}
```

---

## 5 · Tasks

All task paths gate access through the parent Request on the caller's side (the same
`usp_GetRequestByIdForUser` membership join every record read uses): a forbidden **or**
non-existent parent both resolve to null → **403, never 404** (BS §22.6).

### `GET /api/v1/requests/{recordId}/tasks`
List the tasks on a record, in display order (open first, completed/cancelled sink to the
bottom; created-order within each). Viewer+ on the record's workspace.

- **Response:** `TaskDto[]` (access-gated; `403` when the caller can't see the record).

### `POST /api/v1/requests/{recordId}/tasks`
Create a Task under a Request. Supports single tasks and bundle templates.

- **Body:** `TaskCreateRequest` — `{ kind: 'single', title, phase, assignee?, typedField?: { definitionId, value } }` OR `{ kind: 'bundle', bundleTemplateId }` to apply a template.
- **Response:** `201 → TaskDto[]` (bundle) or `TaskDto` (single). `403` when the caller can't see the parent.

### `GET /api/v1/workspaces/{id}/task-bundles`
List the workspace's seeded bundle templates for the composer's "Add bundle" picker. Viewer+.

- **Response:** `TaskBundleTemplate[]` — `{ id, name, tasks[] }`.

### `PATCH /api/v1/tasks/{id}`
Update task status, title, assignee, typed-field value, or Notes & decisions. Checking a task
off (`status: 'Done'`) stamps `completedAt`; reopening clears it.

- **Body:** `TaskPatchRequest` — sparse fields.
- **Response:** `200 → TaskDto`. `403` when the caller can't see the parent.
- **Errors:**
  - `409 record-on-hold` — Slice 26. Raised only when the patch sets `status: 'Done'` and the parent record's `statusHold` is `OnHold` or `Abandoned`. Other edits (notes, phases, assignments, typed-field values) remain allowed while a record is held (D3 scope).

> **`POST /api/v1/tasks/{id}/promote-to-request` moved to slice 10.** Promote runs Copy
> (`POST /records/{id}/copy`) and stamps a typed `related` link back — both land in slice 10.
> It is documented in §9 (Copy) rather than here.

---

## 6 · Gates and approvals

### `GET /api/v1/requests/{recordId}/approval-requests` (Slice 8)
The gates on a record — the Tasks & gates tab reads this to render each open gate inline within its
target phase group (and resolved gates as a "Resolved" chip). Access is baked into the read: a
forbidden or non-existent record returns **403, never 404** (BS §22.6); an accessible record with no
gates returns an empty list.

- **Response:** `ApprovalRequestDto[]` — each with its frozen `slots` and its `decisions`.
  `FrozenApproverSlot` carries `eligibleMembers: { userId, displayName }[]` snapshotted at gate-open, so
  the "Select your name" dropdown renders names without a live user-directory lookup (the directory is
  slice 12). A superseded rejection is retained on `decisions` as history; the live (non-superseded)
  decision drives each slot's state.
- **Errors:** `403` — caller cannot see the record.

> **Gate opening is folded into `POST /requests/{id}/stage`.** A gated transition returns
> `200 { advanced: false, gateOpened: ApprovalRequestDto }` and opens the gate instead of advancing;
> an ungated transition returns `{ advanced: true, newStage }`. A second attempt while a gate is open
> returns `409 gate-already-open`. There is no separate open-gate endpoint.

### `POST /api/v1/approval-requests/{id}/decisions`
Submit an approve or reject decision on a slot.

- **Body:** `ApprovalDecisionRequest` — `{ slotIndex: number, decidedByUserId: string, decision: 'Approved' | 'Rejected', comment?: string }`. `decidedByUserId` is the name the acting team member picked from the "Select your name" dropdown. `comment` is **required when Rejected** (blueprint / changelog rule); returns `400` if missing.
- **Response:** `200 → ApprovalRequestDto` (with updated slot decisions + `state`).
- **Errors:**
  - `409 record-on-hold` — Slice 26. Approvals are blocked while the parent record's `statusHold` is `OnHold` or `Abandoned` (the addendum's "pauses gate approvals" rule is unambiguous, no per-decision carve-out).
- **Business rules:**
  - `decidedByUserId` must be a current member of the slot's team AND in the frozen eligibility set (BS §7.2 — frozen slot targets, live team eligibility).
  - Rejection sets the slot to Rejected but does not un-approve other slots (partial-reject preserves standing approvals — BS §7.2).
  - When all slots reach Approved simultaneously, the ApprovalRequest resolves and the record advances to the target stage (StageTransition event fires).

### `POST /api/v1/approval-requests/{id}/re-request`
Return a rejected slot to Pending so it can be signed again after follow-up.

- **Body:** `{ slotIndex: number }`.
- **Response:** `200 → ApprovalRequestDto`.

### `POST /api/v1/approval-requests/{id}/proxy-decision` — Workspace admin
Record an off-platform sign-off. Marked in the audit as manually-entered proxy (BS §7.3).

- **Body:** `ApprovalDecisionRequest & { proxyContext: string }`.
- **Response:** `200`.

---

## 7 · Comments & activity thread

### `POST /api/v1/records/{recordId}/comments`
Post a comment. Immutable once posted.

- **Body:** `{ body: string, mentionedUserIds?: string[] }`.
- **Response:** `201 → CommentDto`.

### `GET /api/v1/records/{recordId}/thread`
Return the interleaved activity thread — comments + AuditEntries filtered to the caller's entitlements.

- **Response:** `ActivityThreadItem[]` — union of comment items and event items with a discriminator field.

**Comments have no PATCH or DELETE endpoint.** Corrections are new comments.

---

## 8 · Attachments

### `POST /api/v1/records/{recordId}/attachments`
Streaming upload direct to Blob. See `api-blob-attachments.md`.

- **Body:** multipart form (streaming).
- **Response:** `201 → AttachmentDto`.
- **Errors:**
  - `403` — caller cannot edit this record.
  - `413` — file exceeds 25 MB (deployment default; see BS §16).
  - `502` — Blob upload failed after SDK-level retry.

### `GET /api/v1/attachments/{id}/content`
Download the file. Streams from Blob. `Cache-Control: private, no-store`.

### `POST /api/v1/records/{recordId}/attachments/link`
Attach an external URL (no upload).

- **Body:** `{ url, title }`.
- **Response:** `201`.

### `DELETE /api/v1/attachments/{id}`
Soft-delete (`IsDeleted = 1`). Blob remains until retention policy fires.

---

## 9 · Typed links and Copy

### `POST /api/v1/records/{recordId}/links`
Add a typed link from this record to another. Uses BS §2.2 link kinds.

- **Body:** `{ toRecordId, kind: 'related' | 'duplicate-of' | 're-pursuit-of' | 'sourced-from', rationale?: string }`.
- **Response:** `201 → TypedLinkDto`.
- **Business rules:**
  - `duplicate-of` requires the target and the source to be in the same workspace family (a PG record can only duplicate another PG record of the same workspace, or the shared-ID AI-side counterpart).
  - `sourced-from` allowed only from a Feature to a Request.

### `DELETE /api/v1/links/{id}`
Soft-delete the link (audit-preserved).

### `POST /api/v1/records/{recordId}/copy`
Copy the record into a new draft in a target workspace. Returns the draft ID.

- **Body:** `CopyRequest` — `{ targetWorkspaceId, includeAttachments: boolean, linkBackKind?: 'related' | 're-pursuit-of' }`.
- **Response:** `201 → { draftId }`.

---

## 10 · Watchers

### `GET /api/v1/records/{recordId}/watchers`  *(slice 12 — added: the prototyped Watchers card needs the roster)*
List the record's live watchers + the caller's own subscription state. Access-gated on the caller's membership of the record's workspace — a forbidden/non-existent record is `403`, never `404` (BS §22.6).

- **Response:** `WatcherListDto` — `{ watchers: WatcherListItemDto[], isWatching }`. `displayName` is carried so the card renders avatars without a directory fetch.
- **Slice 26:** the caller's own `WatcherListItemDto` carries five per-record notification preference booleans (`notifyGateDecisions`, `notifyStatusChanges`, `notifyTaskSignoffs`, `notifySlaAndDueDateReminders`, `notifyMentionsAndComments`). Rows for other watchers omit these fields entirely (privacy floor — a watcher never sees another watcher's preferences). A missing `WatcherNotificationPreference` row defaults every preference to `true`.

### `POST /api/v1/records/{recordId}/watchers`
Subscribe the caller (or another user, if admin) to the record. Idempotent — re-subscribing is a no-op.

- **Body:** `{ userId?: string }` (defaults to caller).
- **Response:** `204`.

### `PATCH /api/v1/records/{recordId}/watchers/me`  *(slice 26)*
Sparse patch of the caller's own record-scoped state: subscribe toggle plus the five per-record notification preferences. Preferences persist across subscribe/unsubscribe so they are restored on re-subscribe (D4). Only the caller's own state is ever mutated — no admin escalation path.

- **Body:** `WatcherPreferencesPatchRequest` — `{ isWatching?, notifyGateDecisions?, notifyStatusChanges?, notifyTaskSignoffs?, notifySlaAndDueDateReminders?, notifyMentionsAndComments? }`. Omitting a field leaves that setting unchanged.
- **Response:** `200 → WatcherListDto` — refreshed roster including the caller's own five booleans.
- **Errors:** `403` — caller cannot see the record.

### `DELETE /api/v1/records/{recordId}/watchers/{userId}`
Unsubscribe. Caller may remove their own subscription; a WorkspaceAdmin may remove anyone's. `403` otherwise.

- **Response:** `204`.

---

## 11 · Feature Catalog

### `POST /api/v1/features/query`  *(slice 14 — `POST` not the earlier `GET /query`: matches the established `POST …/query` body convention; api/CLAUDE.md "no complex params in query strings")*
List Features (AI Solutions workspace only — the reporting hub). AI-workspace Viewer+ (a non-member gets `403`). Firm-wide read-only access to Published features via the Dashboard-viewer surface (BS §10.4) is slice 23.

- **Body:** `PaginatedQuery` (the `FeatureListQuery` "same shape as `RequestListQuery`" — both are `PaginatedQuery`). Filter keys: `maturity`/`featureType`/`techStack`/`capabilityTags` (select), `name` (text). Sort keys: `id`/`name`/`featureType`/`maturity`/`updatedAt` (default `updatedAt` desc — the "Published catalog" starter view).
- **Response:** `PaginatedResponse<FeatureListRow>`.

### `GET /api/v1/features/{id}`
Feature detail. `403` (never `404`) when not visible (BS §22.6). `sourcedFromRecordIds` resolves from the feature's `sourced-from` typed links.

### `POST /api/v1/features`
Create a Feature (Member+ in AI Solutions workspace — resolved server-side by `Kind='ai-solutions'`). `503` if no AI Solutions workspace is provisioned.

- **Body:** `FeatureCreateRequest` (carries optional `queuedLinks` — the `sourced-from` link-back from an Add-to-catalog draft, stamped at create).
- **Response:** `201 → FeatureDto`.

### `POST /api/v1/requests/{recordId}/add-to-catalog`
Prefill a Feature draft from a shipped Request. **Service-level operation** (no dedicated proc) mirroring Copy (§9): reads the source Request access-gated, builds a `Feature`-typed Draft prefilled same-field-identity (name, techStack, solutionPattern, repoUrl) via `usp_SaveDraft`, and queues a `sourced-from` link. The link is stamped from the new feature at submission (`POST /features`). Source not visible → `403`.

- **Response:** `201 → { draftId }`.

### `PATCH /api/v1/features/{id}`
Update fields (maturity, tags, how-to-reuse, etc.).

### `POST /api/v1/features/{id}/publish`
Set Maturity = Published.

### `POST /api/v1/features/{id}/deprecate`
Set Maturity = Deprecated. Never hard-deleted.

---

## 12 · Announcements  *(slice 13 — consumer reads are flat/cross-workspace; admin authoring is workspace-scoped, matching Lifecycle §18)*

### `POST /api/v1/announcements/query`  *(slice 13 — `POST` not `GET`: `POST …/query` body convention + "no complex params in query strings")*
The caller's Published, un-expired, in-audience announcement history (S22), across every workspace they belong to. Any member.

- **Body:** `AnnouncementQuery` — `{ page, pageSize }`.
- **Response:** `PaginatedResponse<AnnouncementListRow>`.

### `GET /api/v1/announcements/{id}`
Detail (S21). Audience-gated — a caller who cannot see it gets `403`, never disclosing existence (§22.6). Author + workspace admins may read any status.

### `POST /api/v1/workspaces/{workspaceId}/announcements` — Workspace admin  *(slice 13 — workspace-scoped path; §12 originally listed a flat `POST /announcements`. Create needs a target workspace, so it is scoped like Lifecycle/Fields.)*
Create a Draft announcement. **Body:** `AnnouncementCreateRequest`.

### `POST /api/v1/workspaces/{workspaceId}/announcements/query` — Workspace admin  *(slice 13 — the S23 manage list: every status in the workspace)*
The workspace's full announcement list across all statuses (Draft / Published / Retired). Effective status collapses an expired-Published row to Retired. **Body:** `AnnouncementQuery`.

### `PATCH /api/v1/announcements/{id}` — author or Workspace admin
Full replace of the editable fields (`AnnouncementPatchRequest`). A Retired announcement is immutable → `409`.

### `POST /api/v1/announcements/{id}/publish` — author or Workspace admin
Draft → Published; emits `announcement.published` on the spine exactly once (idempotent re-publish does not re-fan), whose in-process fan-out delivers "Announcement posted" to the audience's bells. Publishing a Retired announcement → `409`.

### `POST /api/v1/announcements/{id}/retire` — author or Workspace admin
Retire (never hard-delete). Idempotent.

*The bell deep-links an `announcement-posted` notification to S21 via the new nullable `Notifications.AnnouncementId` (see §13 / data-model).*

---

## 13 · Notifications and the bell

### `POST /api/v1/notifications/query`  *(slice 12 — `POST` not `GET`: matches the established `POST …/query` body convention, requests/features; api/CLAUDE.md "no complex params in query strings")*
Bell centre payload for the caller. Caller-scoped across all their workspaces; newest first.

- **Body:** `NotificationQuery` — `{ page, pageSize, unreadOnly }`.
- **Response:** `PaginatedResponse<NotificationDto>` — mixed record events + announcement postings.

### `GET /api/v1/notifications/unread-count`  *(slice 12 — added: drives the bell badge)*
The caller's unread count across all their workspaces.

- **Response:** `UnreadCountDto` — `{ count }`. `Cache-Control: private, no-store`.

### `POST /api/v1/notifications/mark-all-read`
Mark all the caller's notifications read. Idempotent. **Response:** `204`.

### `POST /api/v1/notifications/{id}/mark-read`
Mark one read. Only the caller's own notification — someone else's id is `403` (never discloses existence). Idempotent. **Response:** `204`.

> **Fan-out mechanism (slice 12).** Notifications are materialised **in-process** on the event spine via `usp_FanOutNotification`, registered alongside `AuditWriter` (`module-boundaries.md §16/§20`). The Service-Bus/Worker path stays the documented production mechanism but is a **no-op in the dev/test stack** — the same "no-op when Azure infra unset" pattern as slice 9's derived mirror and slice 11's config-selected blob. Targets: **Watchers** (all events on the record), **mentioned users** (`comment.posted` payload), **approver-team eligible members** (`gate.opened` → sign-off-requested), and the **AI Intake group** (`escalation.opened`). Requestor / Business Owner are **not** targeted — they are text field values in Phase 1, not user references (see `module-boundaries.md §16`, which scopes targets to Watchers / ApproverTeamMembership / group membership). The actor is excluded; disabled accounts are suppressed (BS §6.8); cross-side receivers of an escalated record are deduped.

---

## 14 · Search

> **Access model (slice 15).** Both endpoints gate access **inside the stored proc** (a
> `WorkspaceMembership` join on the searched workspace): a non-member — or any query matching nothing
> the caller can see — gets an **empty result, never a `403`**, so search never discloses existence
> (BS §9.5 / §22.6). There is no controller-level `403`; every authenticated caller may search and the
> results are the access boundary. **Matching is LIKE-based token overlap, not SQL Server full-text** —
> the dev/test stack is LocalDB (no Full-Text component); same resolution as slice 6's similar-requests
> nudge, approved at the slice-15 plan-confirmation. No OCR (attachments match on filename only). Legacy
> ID (in `Requests.FieldValues.$.legacyId`) is searchable.

### `GET /api/v1/search?q={query}&workspaceId={id}`
Records-only workspace search — top-bar workspace-search behavior (records name + ID, max 6 results, access-respecting). *(slice 15 — matches on Name / Description / RecordId / Legacy ID.)*

- **Response:** `SearchHitDto[]` — capped at 6.

### `POST /api/v1/search/full`
Full workspace search — fields, comments, attachment filenames (BS §9.5, `S27`). *(slice 15 — `pageSize > 100` → `400`, never clamped, per api/CLAUDE.md pagination.)*

- **Body:** `{ query, workspaceId, page, pageSize }`.
- **Response:** `PaginatedResponse<SearchResultDto>` — two proc result sets (page rows + total count).

---

## 15 · Saved views and dashboards

### `GET /api/v1/workspaces/{id}/saved-views?objectType={Request|Feature|Task|Announcement}`  *(slice 14 — `objectType` query param added so a view binds to one list surface: a Request view never shows on the Feature picker. Defaults to `Request` when omitted.)*
List saved views the caller can see on one surface — every shared view in the workspace + the caller's own personal views (Viewer+).

### `POST /api/v1/workspaces/{id}/saved-views`
Create — personal (Member+) or shared (WorkspaceAdmin).

- **Body:** `SavedViewUpsertRequest` — `{ objectType, name, scope: 'personal' | 'shared', isDefault, columns, filters, sort }` *(slice 14 — `objectType` added)*.
- **Response:** `201 → SavedViewDto` *(slice 14 — the DTO carries `objectType` + `ownerUserId`)*.

### `PATCH /api/v1/saved-views/{id}` / `DELETE /api/v1/saved-views/{id}`
Edit / soft-delete (personal by owner; shared by WorkspaceAdmin). Unknown id → `404`; not authorized → `403`. Delete never touches records (BS §22.4).

### `GET /api/v1/workspaces/{id}/dashboards`  *(slice 23)*
Dashboards visible to the caller (audience two-layer). **Viewer+** of the workspace → `DashboardListDto` (`items[]` = metadata only: id, slug, name, description, audience, isDefault, objectType, widgetCount, updatedAt). Non-member → `403`. R1 seeds are all `everyone`-audience.

### `GET /api/v1/dashboards/{id}?drill={urlEncodedJson}`  *(slice 23)*
Full dashboard with **every widget resolved to the caller's entitlements** → `SavedDashboardDto`. Each widget's `data` is narrowed by `type` (KpiTileData / SegmentedBarData / HeatmapMatrixData / RecordsGridData / …); the API walks the row's `widgets` list and runs the fixed metric resolver named by `config.metric` (unknown metric → empty widget, never a failure). **Access:** Viewer+ on the dashboard's workspace **OR** the caller's `WorkspaceMembership.BoundDashboardId == id` (bound Dashboard-viewer, S16 — forces `supportsDrillThrough=false` and ignores `drill`). Existence checked before access: unknown id → `404`, inaccessible → `403` (never disclosing). `drill` (S6 only) filters the embedded records-grid widget server-side — shapes: `{type:'origin'|'category'|'outcome',value}` · `{type:'cell',origin,category}` · `{type:'closedCell',origin,outcome}` · `{type:'unassigned'}`.

### `PATCH /api/v1/dashboards/{id}`  *(slice 23 — S32 shared-dashboards management)*
Edit a dashboard's `name` / `audience`, or `retire` it (soft-delete). **WorkspaceAdmin** of the dashboard's workspace → `200 SavedDashboardDto`; unknown id → `404`; not admin → `403`. Body `DashboardPatchRequest` (`{ name?, audience?, retire? }`). Promote-from-personal is N/A in R1 (no personal dashboards — fixed layouts only).

---

## 16 · Home surface

### `GET /api/v1/home?workspaceId={id}` — Viewer+
Composite payload for the per-user Home (BS §10.7, S1). Assembles five viewer-scoped reads for the active workspace. **Slice 22:** scoped to `?workspaceId=` (not the parameterless form the earlier draft named) — every panel is workspace-specific and the SPA resolves an active workspace on every surface; the prototype's Home lives inside the workspace-switcher context, so it re-queries when the workspace changes. The single authoritative access check is workspace membership (Viewer+ → 403, never 404). Empty/missing `workspaceId` → 400.

- **Response:** `HomeDto` (`shared/types/home.ts`) — `{ workspaceId, decisions[], decisionCount, work[], workCount, activity[], sinceLastSeenAt, triage[], triageCount, pinnedAnnouncements[] }`.
  - `decisions` — "Needs your decision": open gates where the caller is an eligible, unsigned frozen-slot member (`usp_GetHomeDecisions`).
  - `work` — "Your work today": records the caller owns (`CreatedBy`; Phase 1 has no assignee *user reference*), open only, urgency-ordered; SLA derived API-side from `RequestsService.ComputeSla` (`usp_GetHomeWork`).
  - `activity` + `sinceLastSeenAt` — "Since you were last here": record audit events newer than the caller's previous Home visit; the read stamps `Users.LastHomeSeenAt` so the next load shows only what changed (`usp_GetHomeActivity`, OUTPUT param).
  - `triage` — "New to triage": open records with no assigned analyst (`usp_GetHomeTriage`).
  - `pinnedAnnouncements` — pinned, published, in-audience announcements for the strip (`usp_GetHomePinnedAnnouncements`).
- Each panel is capped server-side (20 items; pinned 5); the `*Count` fields are the full match for the header counts.
- **`quickCreateStubs` is not returned** — the prototype's Home renders no quick-create affordance (quick-create lives on the S2 Requests-list view bar per the changelog); the earlier draft field was dropped as the prototype governs.

---

## 17 · Import / Export

### `POST /api/v1/workspaces/{id}/imports/csv` — Workspace admin
Streaming CSV upload; returns per-row validation report.

- **Body:** multipart CSV.
- **Response:** `202 → { importId, status: 'Processing' }`.

### `GET /api/v1/imports/{id}`
Import status + per-row validation report.

- **Response:** `ImportStatusDto` — `{ status, totalRows, landedRows, flaggedRows: Array<{ rowIndex, reasons }> }`.

### `POST /api/v1/exports`
Export a saved view as CSV. Access-respecting: columns follow the view, rows follow the caller's entitlements.

- **Body:** `{ savedViewId }`.
- **Response:** `200` (streams CSV) or `202 + downloadUrl` for large exports.

---

## 18 · Admin surfaces (workspace)

- `GET /api/v1/workspaces/{id}/fields` / `POST` / `PATCH` — Fields & objects (S30).
- `GET /api/v1/workspaces/{id}/lifecycle` / `PATCH` — Lifecycle & gates (S31).
- `GET /api/v1/workspaces/{id}/approver-teams` / `POST` / `DELETE` — Approver Teams membership.
- `POST /api/v1/workspaces/{id}/audit/query` — Workspace audit log (S33, slice 18). *(Built as `POST`, not the `GET` first sketched here: the filter set is multi-field — date range / actor / record / event type — so it takes a JSON body per api/CLAUDE.md, matching every peer `/query` endpoint.)*

Fields & objects retire actions guarded (BS §6.2, §7.1).

### `POST /api/v1/workspaces/{id}/audit/query`
WorkspaceAdmin only (403, never 404). The append-only audit trail for one workspace, newest first, filtered and paginated.

- **Body:** `AuditLogQuery` — `{ page, pageSize, dateFrom?, dateTo?, actorUserId?, recordId?, eventType? }`. `pageSize > 100` → `400` (never clamped).
- **Response:** `PaginatedResponse<AuditLogRowDto>` (`AuditLogRowDto` in `shared/types/audit.ts` — `auditId`, `recordId`/`objectType` nullable, `eventType`, `actorUserId`/`actorName` nullable for system events, `eventAt`, `payload`). Two proc result sets (page rows + total count) from `usp_QueryWorkspaceAudit`; the `AuditEntry` row payload is already sanitised at emit time.

### `GET /api/v1/workspaces/{id}/lifecycle`
The full S31 config. Any workspace member (Viewer+) may read — records and forms render from it.

- **Response:** `LifecycleConfigDto` — `{ workspaceId, lifecycles: LifecycleDto[], roleLabels: string[], approverTeams: ApproverTeamDto[] }`. Each `LifecycleDto` carries its ordered `stages` (with `statusCategory`) and its `gates` (each with `fromStageId`/`toStageId`, `joinKind: 'and'`, and `slots` of `{ roleLabel, eligibleCount }` where `eligibleCount` is computed live from `ApproverTeamMembership`). `roleLabels` folds in the `RoleLabelCatalog` read (full catalog CRUD stays S37/slice 19).

### `PATCH /api/v1/workspaces/{id}/lifecycle`
WorkspaceAdmin only. Reconciles the whole lifecycle/stage/gate structure in one transaction (`usp_SaveLifecycleConfig`, `OPENJSON`): lifecycles/stages/gates absent from the body are retired, present ones upserted. Exactly one lifecycle must be `isDefault`. Gate `from`/`to` must reference stages in the same lifecycle. Emits `lifecycle.updated` on the event spine.

- **Body:** `LifecycleConfigUpdateRequest` — `{ lifecycles: LifecycleUpsertDto[] }`.
- **Response:** `200` with the refreshed `LifecycleConfigDto`. `400 validation` when no/multiple defaults or a gate references a foreign stage.

### `GET/POST/DELETE /api/v1/workspaces/{id}/approver-teams`
Approver-team roster. GET returns `ApproverTeamDto[]` (one per role label with its members). `POST { roleLabel, person }` resolves `person` (display name or email) against active workspace members and adds the membership — `400` when unresolved/ambiguous, `201` with the added `ApproverTeamMemberDto`. `DELETE { roleLabel, userId }` soft-clears the membership. POST/DELETE are WorkspaceAdmin only. Emits `approver-team.updated`.

## 19 · Admin surfaces (platform)

- `GET /api/v1/platform/fields` / `PATCH` — Platform field schema (S34, built slice 3).
- `GET /api/v1/platform/crossing-map` — Crossing map (S35). *(slice 19 — **GET-only, read-only** in R1 Phase 1: reads the seeded PG→AI pairs off `FieldDefinition` via `usp_GetCrossingMap`; there is no `CrossingMap` table until slice 24. The `POST`/`PATCH` propose/confirm workflow is R1 Phase 2 — slice 24.)* → `CrossingMapRowDto[]`.
- `GET /api/v1/platform/role-labels` / `POST` / `PATCH {id}` / `DELETE {id}` — Role-label catalog (S37). *(slice 19 — PATCH rename + DELETE retire added to honour blueprint S37's "add / rename / retire"; a superset of the GET/POST first sketched. Rename/retire are forward-only. POST → `201 RoleLabelDto`; PATCH → `200 RoleLabelDto`; DELETE → `204` idempotent. Blank → `400`, duplicate → `409`, unknown-on-rename → `404`.)*
- `GET /api/v1/platform/access` / `POST` / `DELETE {userId}` — Access provisioning (S36). *(slice 19 — DELETE revoke added. GET → `PrivilegedGrantsListDto` (PlatformAdmin + WorkspaceAdmin holders; WorkspaceAdmin rows read-only). POST `{ userId? | email? }` grants the additive Platform-admin grant (email resolved server-side; unresolved/ambiguous → `400`) → `204`. DELETE → `204` idempotent.)*
- `POST /api/v1/workspaces` — Workspace provisioning (S38, api-contracts §2). *(slice 19 — clones the PG/Dept template via `usp_ProvisionWorkspace`; returns `201 → WorkspaceProvisionResult { id, name, kind, prefix }` (a focused result, not the member-less `WorkspaceDto` §2 first sketched). `409 duplicate-prefix`; `400` on blank input / unknown initial admin; `503` when the template workspace is not provisioned. Phase 1: ops tooling only — the wizard UI is slice 24.)*
- `POST /api/v1/platform/audit/query` — Firm-wide audit log (S39). *(slice 19 — **POST-with-body**, not `GET`: the multi-field filter set takes a JSON body per api/CLAUDE.md, matching every peer `/query` endpoint. Platform-admin only; invisible to workspace admins. **Body:** `FirmWideAuditQuery` — `AuditLogQuery` + optional `workspaceId` narrower. `pageSize > 100` → `400`. **Response:** `PaginatedResponse<FirmWideAuditRowDto>` (adds `workspaceName`).)*

Every platform-admin endpoint verifies `IsPlatformAdmin` on the current user (403 never 404). Platform-level config edits (role-label create/rename/retire, grant/revoke, workspace provision) emit spine events so they land in the firm-wide audit (S39).

## 20 · Error contract detail

All errors: `application/problem+json` with:

```
{
  "type": "https://mws.ai/errors/{code}",
  "title": "Short title",
  "status": 400,
  "detail": "Plain-language explanation",
  "instance": "/api/v1/requests/…",
  "operationId": "…"          // extension — same as X-Operation-Id
}
```

Validation adds `errors: Record<string, string[]>`.

The **codes** the frontend consumes:
- `pending-crossing-edits` — 400 on escalate when uncommitted crossing edits exist.
- `already-escalated` — 409.
- `duplicate-prefix` — 409 on workspace provisioning.
- `filename-collision` — 409 on attachment upload.
- `stale-record` — 409 on optimistic-concurrency PATCH (ETag mismatch).
- `gate-already-open` — 409 on stage advance when a gate is open.
- `rejection-requires-comment` — 400 on approve/reject.
- `not-eligible` — 400 on a decision when the picked name isn't in the frozen eligible set / a current member.
- `unknown-slot` — 400 on a decision for a slot index not on the gate.
- `gate-already-resolved` — 409 on a decision / re-request against a resolved gate.
- `access-denied` — 403.
- `platform-defined-field-locked` — 403 on any attempt to PATCH a platform-defined field (never possible for `AI Solutions Status`).
- `relationship-inconsistent-cardinality` — 409 on a Relationship patch that would change `Cardinality`/`FromObjectType`/`ToObjectType`, OR on a RecordLink create that violates the OneToOne cardinality (slice 25).
- `relationship-retired-blocks-link` — 409 on a RecordLink create against a retired Relationship (slice 25).

## 21 · Relationships (slice 25 — v2)

*See `.claude/rules/dev/document-pipeline` note is n/a — Relationships are pure metadata. Full DTOs in `shared/types/relationships.ts`.*

**Definition endpoints.** All definition mutations require WorkspaceAdmin; list + get require Viewer+ on the workspace. Access violations → **403, never 404** (BS §22.6).

### `GET /api/v1/workspaces/{id}/relationships`
Viewer+. Returns `RelationshipDto[]` sorted by `SortOrder`.

### `POST /api/v1/workspaces/{id}/relationships` — WorkspaceAdmin
Body: `RelationshipCreateRequest`. Creates the row + auto-provisions the paired Link-to-record `FieldDefinition` rows in one transaction. Validation (400): `name`, `fromObjectType`, `toObjectType`, `cardinality ∈ {OneToOne, OneToMany, ManyToMany}`, `fromSideLabel`, `toSideLabel` required; `tabLabel` required when `showOnFromAsTab=true`. Returns 201 with `RelationshipDto`.

### `GET /api/v1/relationships/{relationshipId}?workspaceId={id}` — Viewer+
`workspaceId` is a required query parameter (no RecordId→Workspace resolver exists in R1). Returns `RelationshipDto`. 404 when absent.

### `PATCH /api/v1/relationships/{relationshipId}?workspaceId={id}` — WorkspaceAdmin
Sparse body: `RelationshipPatchRequest`. `cardinality`, `fromObjectType`, `toObjectType` immutable after create (server-side check → 409 `relationship-inconsistent-cardinality`). System rows → 409. Returns 200 with `RelationshipDto`.

### `POST /api/v1/relationships/{relationshipId}/retire?workspaceId={id}&force={bool}` — WorkspaceAdmin
Soft-retires the row + auto-provisioned fields. Default `force=false`: if live `RecordLinks` exist, the server responds **409 with `RelationshipRetireResponse { linkCount, retired: false }`** — the S30 admin editor surfaces a force-confirm dialog with the count, and retries with `force=true` for a 200. System rows → 409 with a plain-language detail. Successful retire → 200.

### `POST /api/v1/relationships/{relationshipId}/restore?workspaceId={id}` — WorkspaceAdmin
Restores a soft-retired row. System rows → 409. Returns 200 with `RelationshipDto`.

**Record-side link endpoints.** Access model: workspace membership. GET/DELETE → Member+; POST → Member+ (creators can link).

**Path decision:** the record-side routes are `/records/{recordId}/relationship-links` (not `/links`). Slice 10's `TypedLinksController` already owns `POST /records/{recordId}/links` for the four hardcoded kinds — the distinct path preserves both.

### `GET /api/v1/records/{recordId}/relationship-links?workspaceId={id}&relationshipId={id?}` — Viewer+
Returns `RelationshipLinkDto[]` in both directions (`direction: 'Out' | 'In'`). Optional `relationshipId` filter narrows to a single relationship.

### `POST /api/v1/records/{recordId}/relationship-links?workspaceId={id}` — Member+
Body: `RelationshipLinkCreateRequest`. Validation (400): `toRecordId` required and cannot equal `recordId`. Errors:
- **404** — relationship not found (50060).
- **409 `relationship-inconsistent-cardinality`** — OneToOne violation (50061).
- **409 `relationship-retired-blocks-link`** — retired relationship (50063).
Returns 201 with `RelationshipLinkDto`.

### `DELETE /api/v1/records/{recordId}/relationship-links/{linkId}?workspaceId={id}` — Member+
Soft delete. Returns 204.

## Deferred to Release 2

- REST API + webhooks for external integrations (BS §13).
- Email delivery / per-user notification preferences / digests (BS §15 Phase 3).
- No-code dashboard builder (BS §15 Phase 3).
- Request templates admin UI (BS §15 Phase 3).
- Toolkit object (BS §2.6 / §19).
- AI-assist layer (BS §14 / §15 Phase 4).
- DMS / SharePoint connector.

R1 API surface is complete without these; every endpoint above bolts onto Release 2's additions without a breaking change (BS §15).
