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

### `POST /api/v1/workspaces` — Platform admin only (R1 Phase 2 self-serve)
Provision a new PG/Dept workspace by cloning the template.

- **Body:** `WorkspaceProvisionRequest` — `{ name, prefix, initialAdminUserId }`. Prefix must be globally unique (validated against `PrefixRegistry`).
- **Response:** `201 → WorkspaceDto`.
- **Errors:** `409 { detail: "Prefix already in use" }` on prefix collision.

### `POST /api/v1/workspaces/{id}/members` — Workspace admin
Add/edit membership.

- **Body:** `MembershipUpsertRequest` — `{ userId, level }`.
- **Response:** `204`.

### `DELETE /api/v1/workspaces/{id}/members/{userId}` — Workspace admin
Deactivate. `409` if the target has a pending named-individual sign-off (BS §6.8). Team-slot sign-offs don't block.

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
Partial update of editable content fields. Every edit produces an AuditEntry.

- **Body:** `RequestPatchRequest` — sparse map of field values.
- **Response:** `200 → RequestDto` (fresh state).
- **Errors:**
  - `403` — insufficient level, or the field is locked (PG-side crossing field on an escalated record; the platform-defined `AI Solutions Status` at any access level).
  - `409` — optimistic concurrency: If-Match ETag mismatch. Client refetches and reapplies per `web-state-management.md`.

### `POST /api/v1/requests/{recordId}/stage`
Advance stage. Fires any configured gate; opens an ApprovalRequest if approvals are pending.

- **Body:** `{ toStage: string }`.
- **Response:** `200 → StageTransitionResult` — either `{ advanced: true, newStage }` or `{ advanced: false, gateOpened: ApprovalRequestDto }`.
- **Errors:**
  - `403` — level.
  - `409` — a gate is already open on this record.

### `POST /api/v1/requests/{recordId}/hold`
Set/clear the Hold flag.

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

### `POST /api/v1/records/{recordId}/watchers`
Subscribe the caller (or another user, if admin) to the record. Idempotent — re-subscribing is a no-op.

- **Body:** `{ userId?: string }` (defaults to caller).
- **Response:** `204`.

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

### `GET /api/v1/search?q={query}&workspaceId={id}`
Records-only workspace search — top-bar workspace-search behavior (records name + ID, max 6 results, access-respecting).

- **Response:** `SearchHitDto[]` — capped at 6.

### `POST /api/v1/search/full`
Full workspace search — fields, comments, attachment filenames (BS §9.5, `S27`).

- **Body:** `{ query, workspaceId, page, pageSize }`.
- **Response:** `PaginatedResponse<SearchResultDto>`.

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

### `GET /api/v1/workspaces/{id}/dashboards`
Dashboards visible to the caller (audience two-layer).

### `GET /api/v1/dashboards/{id}`
Dashboard definition + widget query results (each widget resolves to the caller's entitlements).

---

## 16 · Home surface

### `GET /api/v1/home`
Composite payload for the per-user Home (BS §10.7). Assembles viewer-scoped queries for the panels.

- **Response:** `HomeDto` — `{ needsYourDecision, yourWorkToday, sinceYouWereLastHere, newToTriage, pinnedAnnouncements, quickCreateStubs }`. Each panel is capped (e.g., 20 items) and paginated via panel-specific follow-up endpoints if the user wants more.

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
- `GET /api/v1/workspaces/{id}/audit/query` — Workspace audit log.

Fields & objects retire actions guarded (BS §6.2, §7.1).

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

- `GET /api/v1/platform/fields` / `PATCH` — Platform field schema (S34).
- `GET /api/v1/platform/crossing-map` / `POST` / `PATCH` — Crossing map (S35). Propose (PG admin) + confirm (AI Solutions admin) — R1 Phase 2.
- `GET /api/v1/platform/role-labels` / `POST` — Role-label catalog (S37).
- `GET /api/v1/platform/access` / `POST` — Access provisioning (S36).
- `POST /api/v1/workspaces` — Workspace provisioning (S38). Phase 1: out-of-band (this endpoint stays available but is called by ops tooling). Phase 2: called by an in-app wizard.
- `GET /api/v1/platform/audit/query` — Firm-wide audit log (S39).

Every platform-admin endpoint verifies `IsPlatformAdmin` on the current user.

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

## Deferred to Release 2

- REST API + webhooks for external integrations (BS §13).
- Email delivery / per-user notification preferences / digests (BS §15 Phase 3).
- No-code dashboard builder (BS §15 Phase 3).
- Request templates admin UI (BS §15 Phase 3).
- Toolkit object (BS §2.6 / §19).
- AI-assist layer (BS §14 / §15 Phase 4).
- DMS / SharePoint connector.

R1 API surface is complete without these; every endpoint above bolts onto Release 2's additions without a breaking change (BS §15).
