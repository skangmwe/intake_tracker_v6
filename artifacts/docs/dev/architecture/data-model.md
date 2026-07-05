# Data Model — AI Solutions Tracker

*Entities, relationships, and constraints. Traces to `solution-requirements.md` and `ai_solutions_tracker_build_spec_final.md` (referenced as **BS**). Every entity has the six audit columns (`CreatedAt`, `UpdatedAt`, `CreatedBy`, `UpdatedBy`, `IsDeleted`, `DeletedAt`) per `database-coding-standards.md`.*

## Universal rules

- **No hard delete, anywhere** (BS §4.3) except **Drafts** which are pre-record. Every terminal state is a closure with a captured reason.
- **System fields are immutable to everyone**, including Platform admins.
- **PII columns** are `NVARCHAR` (never `VARCHAR`). Client and Matter numbers are `NVARCHAR` fixed-width so leading zeros survive (BS §3.5).
- **All timestamps** are `DATETIME2` in UTC (`SYSUTCDATETIME()`).
- **Every FK column has a non-clustered index** (`database-performance.md`).
- **Soft-deleted rows are excluded from every query by default** — enforce via query filters and reviewed in code review.

## Entity map

```
Workspace 1─┬─* Request (PK = PREFIX-NNNNNNNN, per §17 field schema)
            │        │
            │        ├─* Task (§2.4 — child; typed field per §7 slice)
            │        ├─* Attachment (files follow record; not in crossing map)
            │        ├─* Comment (immutable — §9.3)
            │        ├─* TypedLink (related / duplicate-of / re-pursuit-of / sourced-from)
            │        ├─* Watcher (subscription — §17.3)
            │        └─* ApprovalRequest (per gate firing; frozen snapshot)
            │
            ├─* Feature (AI Solutions workspace only — §2.5 / §18)
            ├─* Announcement (portable — §2.7 / §20)
            ├─* Toolkit entry (Release 2 — §2.6 / §19; reserved, not built)
            ├─* SavedView
            ├─* SavedDashboard
            ├─* FieldDefinition (workspace-local; platform-defined subset referenced)
            ├─* Lifecycle (workspace-local; one per request type; exactly one default — S31)
            │      ├─* StageDefinition (lifecycle-scoped; ordered; a status category each)
            │      └─* GateDefinition (lifecycle-scoped; from→to StageDefinition)
            │             └─* GateApproverSlot (role-label; AND-join across slots)
            ├─* ApproverTeamMembership (role-label → users, per workspace)
            ├─* UserGroup (e.g. AI Intake seed group)
            ├─* WorkspaceMembership (user × workspace × access level)
            └─* AuditEntry (append-only)

Platform-scope (not per-workspace):
- PrefixRegistry (workspace prefix → workspace)
- PlatformField (system fields + AI Solutions Status + Legacy ID definitions)
- CrossingMap (PG field → AI field pairs)
- RoleLabelCatalog (Platform-admin-managed catalog of gate role labels)
- PlatformAdminGrant (users with the additive firm-wide grant)
- FirmWideAudit (view over per-workspace AuditEntry)
```

## Core entities

### Workspace

Represents one PG/Dept workspace or the central AI Solutions workspace.

| Column | Type | Notes |
|---|---|---|
| `WorkspaceId` | `UNIQUEIDENTIFIER` PK | |
| `Name` | `NVARCHAR(200)` NOT NULL | |
| `Kind` | `NVARCHAR(32)` NOT NULL | `'ai-solutions'` \| `'pg-dept'` \| `'pg-dept-template'` |
| `Prefix` | `NVARCHAR(16)` NOT NULL UNIQUE | Globally unique per BS §6.7. Enforces prefix registry. |
| `NextSequence` | `BIGINT` NOT NULL DEFAULT 0 | Monotonic per-workspace counter for `PREFIX-NNNNNNNN`. Atomically incremented at mint. **First minted record is `PREFIX-00000001`** (BS §6.7). |
| `RetiredAt` | `DATETIME2` NULL | Retired workspaces keep the registry entry so Origin resolves for historical records (forward-only). |
| audit cols | | |

Seed: **two workspaces** — the AI Solutions workspace and one PG/Dept template. Named practice groups are stood up by cloning the template (BS §1.1).

### User

Provisioned by `EnsureUserMiddleware` on first authenticated request (BS §4.1, `api-auth.md`).

| Column | Type | Notes |
|---|---|---|
| `UserId` | `UNIQUEIDENTIFIER` PK | The Entra `oid` claim. **The only user identifier permitted in logs** (`api-logging.md`). |
| `DisplayName` | `NVARCHAR(200)` NOT NULL | PII — never logged. |
| `Email` | `NVARCHAR(320)` NOT NULL | PII — never logged. `preferred_username` claim. |
| `LastSignInAt` | `DATETIME2` NOT NULL | |
| `IsDisabled` | `BIT` NOT NULL DEFAULT 0 | On deactivation. Notifications to disabled accounts are suppressed (BS §6.8). |
| `Theme` | `NVARCHAR(10)` NOT NULL DEFAULT `'light'` | **Slice 2.** UI theme preference (`light`/`dark`, `CK_Users_Theme`). Persisted server-side so it roams across devices; the SPA mirrors it to `localStorage` for the pre-paint theme-init script. Non-PII. Preserved across sign-ins by `usp_UpsertUser`. |
| audit cols | | |

**Always-Encrypted** on `DisplayName` and `Email` per `database/CLAUDE.md` PII rules. **Slice 1 note:** the migration creates these as plain `NVARCHAR` because Always-Encrypted needs a Column Master Key (Key Vault) + Column Encryption Key that do not exist on a bare LocalDB/dev instance. Provisioning the CMK/CEK and converting the two columns to `ENCRYPTED WITH (...)` is a **deploy prerequisite** (staging/prod), tracked in the deployment plan — not built into the migration.

### WorkspaceMembership

Per-workspace access-level assignment. Users belong to multiple workspaces; each membership has its own level.

| Column | Type | Notes |
|---|---|---|
| `MembershipId` | `UNIQUEIDENTIFIER` PK | |
| `WorkspaceId` | FK → Workspace | |
| `UserId` | FK → User | |
| `Level` | `NVARCHAR(32)` NOT NULL | `'Viewer'` \| `'Member'` \| `'WorkspaceAdmin'` |
| `IsDashboardViewer` | `BIT` NOT NULL DEFAULT 0 | Viewer bound to one dashboard as sole surface (BS §10.4). |
| `BoundDashboardId` | FK → SavedDashboard NULL | Set only when `IsDashboardViewer = 1`. |
| audit cols | | |

UNIQUE `(WorkspaceId, UserId)` — one membership per user per workspace (filtered `WHERE IsDeleted = 0`).

> **Slice 1 decision — Platform admin grant.** The additive firm-wide "Platform admin" grant is **not** a column on `WorkspaceMembership`. It is the separate platform-scope `PlatformAdminGrant` table (below), which the entity map and `slice-plan.md` §Slice 1 both name. Keeping one authoritative source avoids a `WorkspaceMembership.IsPlatformAdmin` column drifting out of sync with the grant table. `MeDto.isPlatformAdmin` is computed from `PlatformAdminGrant`. `BoundDashboardId` is created nullable in slice 1; its FK to `SavedDashboard` is added in slice 23 when that table exists.

### Request

The primary object. Field set = BS §17 (already the source of truth). Highlights:

- **PK / Record ID:** `NVARCHAR(20)` — the `PREFIX-NNNNNNNN` string minted from the owning workspace's `NextSequence`. Immutable. On escalation the AI-side record adopts the PG-side ID (shared key — BS §6.1).
- **Workspace:** system field. Holds the current workspace ID; escalated records exist in both the PG workspace and the AI Solutions workspace as **two rows** with the same Record ID (one on each side).
- **Origin:** system-computed lookup — reads the ID prefix and resolves against `PrefixRegistry` to name the originating workspace (BS §17.1). Materialized column so lists / filters / groupings never parse ID substrings.
- **Timestamps:** per-side-honest. The AI-side Created-at is the escalation event; the PG intake Created-at stays on the PG record (BS §6.1, §10.6).
- **Stage / Hold / Outcome:** workspace-local; AI-side Outcome drives closure (BS §8); template-local Outcome closes PG-only records (BS §1.1).
- **Crossing fields ([S] in BS §17):** on the PG record they lock read-only at escalation (snapshot preserved) but the AI-side copies remain AI-editable; edits do not propagate back (BS §6.2 / §6.3). The prototype surfaces the lock as a pale-gold **"⇄ Crossed · locked on PG"** marker in the Intake tab (per full-design-blueprint.md).
- **AI-side ([A]):** live only on the AI Solutions workspace's copy — Assigned Analyst, Due Date, Solution Tier, Solution Pattern, Build Notes, Deploy Date, Outcome, Outcome Notes, Benefit-review date, Benefit realized.
- **Platform-defined ([P]):** Record ID, Workspace, timestamps, Legacy ID, and — critically — **AI Solutions Status**. AI Solutions Status has **no manual write path anywhere** (BS §6.4); it is written by the bridge off the event spine.
- **Derived (● workspace-local baseline):** Display Status (Derived-category), Mirror Status (AI-side only), Priority Score (Calculation = `BusinessValue + EfficiencyGain − LevelOfEffort`), SLA Status (Derived-category — Phase 2).

> **Slice 5 physical storage.** Content-field values live in a single `FieldValues` **JSON** column (the field schema is workspace-configurable, so per-field columns would fight the data-driven design). `Name`, `Description`, `Stage` are also authoritative real columns (hot on lists + covering index) and are mirrored into the JSON so the condition engine derives Display/Mirror Status. List-critical values are **persisted computed columns** projected from the JSON — `DeptPgClient`, `AssignedAnalyst`, `DueDate`, `PriorityScore`. Hold lives in the JSON (`holdBlocked`/`holdReason`). Optimistic concurrency via a `ROWVERSION` (`RowVer`) surfaced as a base64 ETag. **PK is composite `(WorkspaceId, RecordId)`** so escalation's two-row shared-ID model holds.

### Task

Lightweight child of a Request (BS §2.4). Runs on the same engine, carries none of the Request's lifecycle.

| Column | Type | Notes |
|---|---|---|
| `TaskId` | `UNIQUEIDENTIFIER` PK | |
| `RequestId` | FK → Request, NOT NULL | Every Task has exactly one parent (BS §2.4). Not a bridge; reference only. |
| `Title` | `NVARCHAR(400)` NOT NULL | |
| `Assignee` | FK → User NULL | Drives "assigned to you" notification. |
| `Status` | `NVARCHAR(16)` NOT NULL | `'Locked'` \| `'Open'` \| `'Done'` \| `'Cancelled'` |
| `Phase` | `NVARCHAR(32)` NULL | Build phase — for the collapsible phase-grouped task list (Intake / Discovery / Build / QA / Deploy / Post-launch / Unphased). |
| `Notes` | `NVARCHAR(MAX)` NULL | Per-task Notes & decisions expandable field (per blueprint). |
| `CompletedAt` | `DATETIME2` NULL | Stamped on check-off, cleared on reopen. |
| `SortOrder` | `INT` NOT NULL | **Slice 7.** Per-record creation sequence — the stable ordering key (open first, completed/cancelled sink to the bottom, then SortOrder). |
| audit cols | | |

> **Slice 7 build notes.** `RequestId` is the composite FK `(WorkspaceId, RecordId) → Requests` (the Requests PK is composite; a `WorkspaceId` column is stored per-side like Comments/Watcher so tasks stay on the correct copy of an escalated record). **`PreconditionRuleId` is deferred** — no R1 slice sets a task precondition (there is no such UI in the prototype), so the column is omitted until the slice that adds precondition authoring; `Status='Locked'` is supported in the schema + UI render regardless. Two columns were added to the typed field below (`FieldLabel`, `FieldType`) so the read renders without a second lookup.

**Structured typed field per Task** — a Task carries at most one structured typed field:

| Column | Type | Notes |
|---|---|---|
| `FieldDefinitionId` | FK → FieldDefinition NULL | Points at the workspace's field library (managed in S30 Fields & objects). |
| `FieldLabel` | `NVARCHAR(200)` NULL | **Slice 7.** Display name copied from the field definition at capture time (so the read renders without a lookup). |
| `FieldType` | `NVARCHAR(16)` NULL | **Slice 7.** The value kind (`url`/`text`/`number`/`date`/`select`/`checkbox`) — names which single `FieldValue*` column holds the value. |
| `FieldValueUrl` | `NVARCHAR(2048)` NULL | Set when the field's type is URL. |
| `FieldValueText` | `NVARCHAR(MAX)` NULL | Set when Text. |
| `FieldValueNumber` | `DECIMAL(18,4)` NULL | Set when Number. |
| `FieldValueDate` | `DATE` NULL | Set when Date. |
| `FieldValueSelect` | `NVARCHAR(200)` NULL | Set when Select. |
| `FieldValueBool` | `BIT` NULL | Set when Checkbox. |

Only one `FieldValue*` column is set based on the field's type. Enforced by a CHECK constraint (`CK_Tasks_OneFieldValue` — at most one value column non-null). (Alternative: EAV table. Kept inline for the seed since Tasks carry at most one typed field and read is hot.)

**TaskBundleTemplate (slice 7)** — a named, workspace-scoped set of tasks applied together on the composer (blueprint "Task bundle templates"). `TaskBundleTemplateId` PK, `WorkspaceId` FK, `TemplateKey` (unique per workspace), `Name`, `TasksJson` (a `{ title, phase }` array applied set-based via `OPENJSON`), `SortOrder` + audit cols. Seeded on the AI Solutions workspace with the three blueprint templates. Applying a template appends plain Open tasks (the real gate model is slice 8, not task-level signoff).

### Attachment

Files follow the record (BS §2.3). **Not** governed by the crossing map — they carry across the bridge on escalation regardless.

| Column | Type | Notes |
|---|---|---|
| `AttachmentId` | `UNIQUEIDENTIFIER` PK | |
| `RecordId` | `NVARCHAR(20)` NOT NULL | The `PREFIX-NNNNNNNN` string; FK by convention (Requests and Features both accept attachments — the object type is inferred from the ID prefix + object). |
| `ObjectType` | `NVARCHAR(16)` NOT NULL | `'Request'` \| `'Feature'` \| `'Toolkit'` \| `'Announcement'`. |
| `WorkspaceId` | FK → Workspace | Which side of the bridge this attachment lives on (post-escalation attachments duplicate; see BS §6.3). |
| `FileName` | `NVARCHAR(400)` NOT NULL | Searchable per BS §9.5. |
| `ContentType` | `NVARCHAR(200)` NOT NULL | |
| `SizeBytes` | `BIGINT` NOT NULL | |
| `BlobPath` | `NVARCHAR(1024)` NOT NULL | `{workspaceId}/{recordId}/{attachmentId}/{fileName}` |
| `IsLink` | `BIT` NOT NULL DEFAULT 0 | External link (URL only) vs native upload. |
| `ExternalUrl` | `NVARCHAR(2048)` NULL | Set when `IsLink = 1`. |
| audit cols | | |

Uploads stream directly to Blob (never buffered in API memory) per `api-blob-attachments.md`.

### Comment

Immutable (BS §9.3). Corrections are new comments.

| Column | Type | Notes |
|---|---|---|
| `CommentId` | `UNIQUEIDENTIFIER` PK | |
| `RecordId` | `NVARCHAR(20)` NOT NULL | No hard FK — the object type is inferred (like `AuditEntry`). |
| `WorkspaceId` | FK → Workspace | **Slice 6.** Per-side (like `Watcher` / `AuditEntry`): a comment lives on one workspace's copy of the record, so the thread read access-gates by a membership join and an escalated record's two same-`RecordId` rows (slice 9) keep comments on the correct side. |
| `ObjectType` | `NVARCHAR(16)` NOT NULL | `'Request'` in slice 6. |
| `AuthorUserId` | FK → User NOT NULL | |
| `Body` | `NVARCHAR(MAX)` NOT NULL | |
| `MentionedUserIds` | JSON (`NVARCHAR(MAX)`) NULL | Parsed at post time for @mention fan-out. `CHECK (ISJSON)` when not null. |
| audit cols (CreatedAt only meaningfully; edits forbidden) | | `UpdatedAt` = `CreatedAt`. `trg_Comments_PreventMutation` (INSTEAD OF UPDATE, DELETE) rejects every edit/delete — incl. soft-delete — at every access level. |

### TypedLink

Record-to-record references (BS §2.2). Reference only — never a bridge.

| Column | Type | Notes |
|---|---|---|
| `LinkId` | `UNIQUEIDENTIFIER` PK | |
| `FromRecordId` | `NVARCHAR(20)` NOT NULL | |
| `ToRecordId` | `NVARCHAR(20)` NOT NULL | |
| `LinkKind` | `NVARCHAR(32)` NOT NULL | `'related'` \| `'duplicate-of'` \| `'re-pursuit-of'` \| `'sourced-from'` |
| `Rationale` | `NVARCHAR(MAX)` NULL | Optional free-text (BS §2.2). |
| audit cols | | |

Cross-object links allowed (e.g., a `sourced-from` from a Feature to a Request). Cycle prevention is out of scope; typed links don't drive computation, only display.

### Watcher

Per-record subscription (BS §17.3, §11.2). Never a crossing field — kept live per side.

| Column | Type | Notes |
|---|---|---|
| `WatcherId` | `UNIQUEIDENTIFIER` PK | |
| `RecordId` | `NVARCHAR(20)` NOT NULL | |
| `WorkspaceId` | FK → Workspace | Per-side; a user can watch the PG record, the AI record, or both. |
| `UserId` | FK → User | |
| `SubscribedAt` | `DATETIME2` NOT NULL | |
| `UnsubscribedAt` | `DATETIME2` NULL | Soft-cleared subscription. |

UNIQUE `(RecordId, WorkspaceId, UserId)` filtered where `UnsubscribedAt IS NULL`.

### Notification (slice 12)

Per-user delivery log for the bell centre (BS §11.3, module-boundaries §16). One row per (target user, event) — materialised in-process by `usp_FanOutNotification` when the event spine emits (the Service-Bus/Worker path is a no-op in dev, same as slice 9's mirror). Not a crossing field; read-state is per user.

| Column | Type | Notes |
|---|---|---|
| `NotificationId` | `UNIQUEIDENTIFIER` PK | |
| `UserId` | FK → User | The recipient. The bell reads `WHERE UserId = @caller`. |
| `WorkspaceId` | FK → Workspace | The side the notifying event fired on. |
| `RecordId` | `NVARCHAR(20)` NULL | The record the notification points at (NULL for non-record events). |
| `Category` | `NVARCHAR(32)` NOT NULL | `NotificationCategory` — `sign-off-requested` \| `gate-decided` \| `hold-changed` \| `closed` \| `mentioned` \| `escalation-received` \| `announcement-posted` \| `assigned-to-you`. CHECK-constrained. |
| `Summary` | `NVARCHAR(400)` NOT NULL | Human-readable line the bell renders. Ids/enums-derived — never raw PII (`api-pii-handling.md`); the fan-out proc builds it from the record id + category, not from field values. |
| `SourceEventId` | `UNIQUEIDENTIFIER` NOT NULL | The spine `EventId` that produced this — the dedup + trace key. |
| `ReadAt` | `DATETIME2` NULL | Set on mark-read; NULL = unread (drives the badge). |
| audit cols | | |

Dedup UNIQUE `(UserId, RecordId, Category, SourceEventId)` filtered where `IsDeleted = 0` — a user watching **both** sides of an escalated record (same `SourceEventId`) receives exactly one row. Index `(UserId, IsDeleted, CreatedAt DESC)` for the newest-first feed and the unread-count.

### ApprovalRequest

Per-gate-firing entity. Approver set is **frozen at gate-open** (BS §7.2).

| Column | Type | Notes |
|---|---|---|
| `ApprovalRequestId` | `UNIQUEIDENTIFIER` PK | |
| `RequestRecordId` | `NVARCHAR(20)` NOT NULL | The Request the gate fires on. |
| `GateDefinitionId` | FK → GateDefinition | |
| `OpenedAt` | `DATETIME2` NOT NULL | Freeze moment. |
| `ResolvedAt` | `DATETIME2` NULL | When all slots satisfied. |
| `State` | `NVARCHAR(24)` NOT NULL | `'Pending'` \| `'ChangesRequested'` \| `'Resolved'` |
| `FrozenApproverSet` | JSON (`NVARCHAR(MAX)`) NOT NULL | Snapshot of slot definitions at open — team ID + role label + eligible member IDs. |
| audit cols | | |

**Slot decisions** — a child table `ApprovalDecision`:

| Column | Type | Notes |
|---|---|---|
| `DecisionId` | `UNIQUEIDENTIFIER` PK | |
| `ApprovalRequestId` | FK → ApprovalRequest | |
| `SlotIndex` | `INT` NOT NULL | Ordinal into the frozen snapshot. |
| `Decision` | `NVARCHAR(16)` NOT NULL | `'Approved'` \| `'Rejected'` |
| `DecidedByUserId` | FK → User | The name the acting team member picked. |
| `DecidedAt` | `DATETIME2` NOT NULL | |
| `Comment` | `NVARCHAR(MAX)` NULL | **Required when Decision = Rejected** (blueprint / changelog rule). Enforced by CHECK. |
| `IsProxy` | `BIT` NOT NULL DEFAULT 0 | Off-platform sign-off recorded by admin (BS §7.3). |
| audit cols | | |

**Rejection replay** — a rejected slot keeps its ApprovalDecision row and gets a **new** row on retry. The current decision per slot is the latest `DecidedAt`. When a rejected slot is Re-request-approved, the slot returns to pending (new empty state — the historical rejection row remains).

> **Slice 8 build notes.** `ApprovalRequests` carries a per-side `WorkspaceId` (like Tasks/Comments) plus the **composite FK `(WorkspaceId, RequestRecordId) → Requests`**, and freezes the gate name and the from→to transition as both **keys** (drive the advance) and **labels** (drive the "fires on Build → QA" pill) so a later lifecycle rename never rewrites a gate in flight. **At most one unresolved gate per record** is enforced by a filtered UNIQUE index (`WHERE State <> 'Resolved' AND IsDeleted = 0`) — the race backstop behind `usp_OpenGate`'s `gate-already-open` pre-check. `FrozenApproverSet` stores `[{ slotIndex, roleLabel, displayLabel, eligibleMembers: [{ userId, displayName }] }]` — eligible members are resolved live from `ApproverTeamMembership` at open and frozen (an empty roster freezes an empty eligible set: the gate opens but is un-signable until an admin adds members). The **"current decision per slot" uses a `SupersededAt` column** rather than latest-`DecidedAt`: a new decision (or a re-request) supersedes the slot's prior live row, so there is at most one non-superseded decision per slot and a superseded rejection is retained verbatim as history. Gate resolution (all slots live-Approved) advances the record inline (mirrors `usp_SetRequestStage`). All read/write procs project through `vw_ApprovalRequestDetail` (AR row + decisions rolled up as JSON). **Re-request is an explicit endpoint** (`POST /re-request`, `api-contracts.md §6`) — the reconciled durable model, not the prototype's session-only inline re-review; the gate block renders a "Re-request approval" button on a rejected slot. `FrozenApproverSlot` in `shared/types/gates.ts` was updated to carry `eligibleMembers` (name + id) and `ApprovalDecisionDto` gained `decidedByName` + `superseded`, so the "Select your name" dropdown and rejection lines render without a user-directory fetch.

### AuditEntry

Append-only, immutable (BS §12). Captured off the event spine.

| Column | Type | Notes |
|---|---|---|
| `AuditId` | `UNIQUEIDENTIFIER` PK | |
| `WorkspaceId` | FK → Workspace | |
| `RecordId` | `NVARCHAR(20)` NULL | Null for workspace-level or config events. |
| `ObjectType` | `NVARCHAR(16)` NULL | Same. |
| `EventType` | `NVARCHAR(64)` NOT NULL | See `EventType` enum in shared types. |
| `ActorUserId` | FK → User NULL | Null for system-generated events. |
| `EventAt` | `DATETIME2` NOT NULL | |
| `EventPayload` | JSON (`NVARCHAR(MAX)`) NOT NULL | Structured payload — old→new for field changes, slot context for gate decisions, source/target for escalation events, etc. Never contains raw PII beyond what's necessary; sanitized per `api-pii-handling.md`. |

**Never updated, never deleted.** Enforced by an INSTEAD OF trigger that rejects `UPDATE`/`DELETE` at every access level. Audit column `IsDeleted` remains for consistency but a soft-delete would be rejected too.

### FieldDefinition

Configuration entity per workspace. Definitions are `versioned in place` — edits capture a new version row, previous versions retained for audit-trail resolution. Retirement is guarded (BS §6.2 retirement guard for crossing-map sources/targets).

### Lifecycle / StageDefinition / GateDefinition / GateApproverSlot (S31)

The prototype's **Lifecycle & gates** surface (S31) is authoritative: a workspace owns **many lifecycles**, one per **request type** chosen at intake (BS §7.1 — "lifecycle as data"). Each lifecycle carries its own ordered stages and its own approval gates. Exactly one lifecycle per workspace is the **default** (picked when a request does not name a type). This supersedes the earlier flat single-stage-set model; **Slice 5's Stage field options are sourced from the record's lifecycle's `StageDefinition` rows**, not a workspace-wide set.

#### Lifecycle

| Column | Type | Notes |
|---|---|---|
| `LifecycleId` | `UNIQUEIDENTIFIER` PK | |
| `WorkspaceId` | FK → Workspace | |
| `Name` | `NVARCHAR(200)` NOT NULL | e.g. "Standard AI build". |
| `RequestType` | `NVARCHAR(120)` NOT NULL | The type a request picks at intake to select this lifecycle. |
| `IsDefault` | `BIT` NOT NULL DEFAULT 0 | Exactly one per workspace — filtered unique index `WHERE IsDefault = 1 AND IsDeleted = 0`. |
| `SortOrder` | `INT` NOT NULL DEFAULT 0 | |
| audit cols | | |

#### StageDefinition (lifecycle-scoped)

| Column | Type | Notes |
|---|---|---|
| `StageDefinitionId` | `UNIQUEIDENTIFIER` PK | |
| `LifecycleId` | FK → Lifecycle | |
| `WorkspaceId` | FK → Workspace | Denormalized for the workspace-scoped read/index. |
| `StageKey` | `NVARCHAR(64)` NOT NULL | Stable machine key (`intake`, `discovery`, `build`, `qa`, `deploy`, `post-launch` on the seed). Unique per lifecycle. |
| `Label` | `NVARCHAR(120)` NOT NULL | Display name. |
| `StatusCategory` | `NVARCHAR(16)` NOT NULL | `'Intake'` \| `'Build'` \| `'Review'` \| `'Deploy'` — maps stages to dashboard/rollup buckets (§10.6). CHECK-constrained. |
| `SortOrder` | `INT` NOT NULL | Position on the track. |
| audit cols | | |

#### GateDefinition (lifecycle-scoped)

| Column | Type | Notes |
|---|---|---|
| `GateDefinitionId` | `UNIQUEIDENTIFIER` PK | |
| `LifecycleId` | FK → Lifecycle | |
| `WorkspaceId` | FK → Workspace | Denormalized for the workspace-scoped read/index. |
| `Name` | `NVARCHAR(200)` NOT NULL | e.g. "QA readiness gate". |
| `FromStageId` | FK → StageDefinition | Transition source. |
| `ToStageId` | FK → StageDefinition | Transition target — the gate fires on entry to this stage. |
| `JoinKind` | `NVARCHAR(8)` NOT NULL DEFAULT `'and'` | AND-join is the only kind (every slot must approve). |
| `SortOrder` | `INT` NOT NULL DEFAULT 0 | |
| audit cols | | |

#### GateApproverSlot

Team-only approver slot (per prototype changelog — "gate approver slots now identify only the team/role label"). The eligible members are resolved live from `ApproverTeamMembership`; the frozen set is snapshotted onto `ApprovalRequest` at gate-open (slice 8).

| Column | Type | Notes |
|---|---|---|
| `GateApproverSlotId` | `UNIQUEIDENTIFIER` PK | |
| `GateDefinitionId` | FK → GateDefinition | |
| `RoleLabel` | `NVARCHAR(120)` NOT NULL | A label from `RoleLabelCatalog`. |
| `SlotIndex` | `INT` NOT NULL | Position within the gate. |
| audit cols | | |

#### ApproverTeamMembership (per workspace)

Role-label → **real workspace users** (not free text). Powers the S31 Approver-teams roster and the live "N eligible" count; slice 8 freezes eligible `UserId`s at gate-open.

| Column | Type | Notes |
|---|---|---|
| `ApproverTeamMembershipId` | `UNIQUEIDENTIFIER` PK | |
| `WorkspaceId` | FK → Workspace | |
| `RoleLabel` | `NVARCHAR(120)` NOT NULL | |
| `UserId` | FK → User | The member. Resolved from a typed name/email against active workspace members at add time. |
| audit cols | | UNIQUE `(WorkspaceId, RoleLabel, UserId)` filtered `WHERE IsDeleted = 0`. |

**Seed** (AI Solutions workspace): one default lifecycle "Standard AI build" (type "Full build") with the six canonical stages, plus the QA-readiness (Build→QA) and Post-launch-readiness (Deploy→Post-launch) gates and their team-only slots. The `RoleLabelCatalog` is seeded (AI Solutions Manager · GCO · InfoSec · PG/Dept Lead · Data Privacy). **`ApproverTeamMembership` seeds empty** — the prototype's named people are mock fixtures; real members are added by admins (or accrue as users sign in). "N eligible" reads live from an empty roster until then.

### PlatformField, CrossingMap, RoleLabelCatalog, PrefixRegistry

Platform-scope tables governed centrally. See BS §4.3 and §6.2. Not per-workspace.

- **PrefixRegistry** — `Prefix (PK) → WorkspaceId + workspace name at mint time`. Immutable historical record so Origin resolves for records minted under retired workspaces (BS §6.7).
- **CrossingMap** — `PgFieldId × AiFieldId + option correspondence (JSON)` for select mappings; type-compatibility validated at save; retirement guarded.

### Draft

Pre-record and pre-audit. Sits outside the no-hard-delete floor.

| Column | Type | Notes |
|---|---|---|
| `DraftId` | `UNIQUEIDENTIFIER` PK | |
| `OwnerUserId` | FK → User | Personal — no cross-user visibility. |
| `WorkspaceId` | FK → Workspace | |
| `ObjectType` | `NVARCHAR(16)` NOT NULL | `'Request'` \| `'Task'` \| `'Announcement'` \| `'Feature'` |
| `Body` | JSON (`NVARCHAR(MAX)`) NOT NULL | Prefilled field values + queued typed links (from similar-requests nudge, per BS §9.8). |
| `LastEditedAt` | `DATETIME2` NOT NULL | |

Discardable freely by owner (real DELETE, not soft) — the sole exception to the no-hard-delete floor.

## The escalation bridge (data-model view)

Escalation creates a **second Request row** in the AI Solutions workspace with the **same `RecordId`** as the PG-side row. This is the shared canonical ID (BS §6.1). Both rows persist. The bridge is:

- **Shared key:** the two rows have the same `RecordId` but different `WorkspaceId`.
- **Field lock:** each PG-side crossing field is snapshotted into `RequestCrossingSnapshot` (`LockedAtEscalation = 1`) at escalation. **Snapshot-presence on a side is the lock signal** — the PATCH boundary (`RequestsService.IsLockedFieldViolation`) blocks edits to those field keys on the PG side (`usp_GetBridgeForRecord` reports the caller's side). No `LockedAtEscalation` flag was added to `Requests` itself; the snapshot table is the single source.
- **Status mirror (slice-9 build note — read-time derivation).** The PG-side `AI Solutions Status` is **derived at read time** from the AI-side counterpart row's current stage + hold/outcome (`RequestsService.DeriveMirrorStatus`; Deploy/Post-launch → "Deployed"), surfaced in the DTO `bridge.aiSolutionsStatus`. There is **no stored column and no INSTEAD OF trigger** in Phase 1 — the dev/test stack has no Service Bus, so a Worker mirror consumer would not fire; the derivation is always current and needs no event plumbing. "No manual write path" is enforced by rejecting any PATCH that targets the platform-defined key `ai-solutions-status` (403). The stored, event-driven, condition-engine-keyable field is **Phase 2** (slice 23), when something first keys on it. **Slice 9 therefore adds zero migrations** — the whole bridge derives from the two shared-ID rows + `RequestCrossingSnapshot`.

**One-time, one-way (BS §6.6)** — the composite PK `(WorkspaceId, RecordId)` plus a check in `usp_EscalateRequest` that no AI-side row exists for the given `RecordId` yet (throws 50044 → 409). A mistaken escalation is resolved by closing the AI-side record with a reason; there is no de-escalation code path.

## PII / Confidentiality boundary summary

Per `solution-requirements.md` Section 4 (Confidential + PII Present) and `api-pii-handling.md`:

- User identifiers in logs and telemetry: **Entra `oid` only.** DisplayName and Email never logged.
- Client / Matter numbers: stored NVARCHAR fixed-width. Never in filenames. Never in error responses (`api-error-handling.md`).
- Attachments: may contain client-adjacent artifacts. Access-checked on every download.
- Comments and free-text description fields: treated as Confidential; not logged in application logs.
- Blob paths: `{workspaceId}/{recordId}/{attachmentId}/{fileName}` — no client/matter in the path.
- Audit trail: captures old→new for field changes but sanitizes anything flagged PII-sensitive.
- Search index: workspace-scoped, access-respecting per BS §9.5. Never leaks a hit across workspaces.

## Index and performance notes

Full index plan lives in the migration scripts (see `slice-plan.md`, foundation slice). Highlights:

- Every FK column has a non-clustered index.
- `Request(WorkspaceId, Stage, IsDeleted, UpdatedAt)` composite for list queries.
- `Request(RecordId)` UNIQUE for the shared-key lookup at escalation.
- `Request(WorkspaceId, IsDeleted) INCLUDE (Name, DisplayStatus, AssignedAnalyst, DueDate, Submitted)` — the covering index for the Requests list surface.
- `AuditEntry(WorkspaceId, EventAt DESC, EventType)` for audit-log queries.
- `AuditEntry(RecordId, EventAt DESC)` for per-record activity thread.
- `PrefixRegistry(Prefix)` UNIQUE. Read at every ID mint and every Origin resolution.
- Filtered index on `Watcher (RecordId, WorkspaceId, UserId) WHERE UnsubscribedAt IS NULL`.
