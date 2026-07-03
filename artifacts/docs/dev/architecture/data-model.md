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
            ├─* StageDefinition (workspace-local; six-stage seed in AI Solutions)
            ├─* GateDefinition (workspace-local; approver slots point at teams)
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
| `PreconditionRuleId` | FK → FieldRule NULL | Single condition-engine rule (BS §3.1) that gates the Task; not an inter-task dependency (BS §2.4). |
| `Notes` | `NVARCHAR(MAX)` NULL | Per-task Notes & decisions expandable field (per blueprint). |
| `CompletedAt` | `DATETIME2` NULL | Stamped on check-off, cleared on reopen. |
| audit cols | | |

**Structured typed field per Task** — a Task carries at most one structured typed field:

| Column | Type | Notes |
|---|---|---|
| `FieldDefinitionId` | FK → FieldDefinition NULL | Points at the workspace's field library (managed in S30 Fields & objects). |
| `FieldValueUrl` | `NVARCHAR(2048)` NULL | Set when the field's type is URL. |
| `FieldValueText` | `NVARCHAR(MAX)` NULL | Set when Text. |
| `FieldValueNumber` | `DECIMAL(18,4)` NULL | Set when Number. |
| `FieldValueDate` | `DATE` NULL | Set when Date. |
| `FieldValueSelect` | `NVARCHAR(200)` NULL | Set when Select. |
| `FieldValueBool` | `BIT` NULL | Set when Checkbox. |

Only one `FieldValue*` column is set based on the field's type. Enforced by a CHECK constraint. (Alternative: EAV table. Kept inline for the seed since Tasks carry at most one typed field and read is hot.)

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
| `RecordId` | `NVARCHAR(20)` NOT NULL | |
| `ObjectType` | `NVARCHAR(16)` NOT NULL | |
| `AuthorUserId` | FK → User NOT NULL | |
| `Body` | `NVARCHAR(MAX)` NOT NULL | |
| `MentionedUserIds` | JSON (`NVARCHAR(MAX)`) NULL | Parsed at post time for @mention fan-out. |
| audit cols (CreatedAt only meaningfully; edits forbidden) | | `UpdatedAt` = `CreatedAt`. Deleting a comment is disallowed at every access level. |

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

### FieldDefinition / StageDefinition / GateDefinition

Configuration entities per workspace. Definitions are `versioned in place` — edits capture a new version row, previous versions retained for audit-trail resolution. Retirement is guarded (BS §6.2 retirement guard for crossing-map sources/targets, §7.1 stage retirement guard).

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
- **Field lock:** each PG-side crossing field has a `LockedAtEscalation = 1` flag (or a snapshot in a companion table `RequestCrossingSnapshot`) — PG-side edits are blocked at the API boundary from that point on.
- **Status mirror:** the platform-defined `AI Solutions Status` field on the PG row is written only by the bridge off the event spine. No manual write path exists at any access level (BS §4.3, §6.4).

**One-time, one-way (BS §6.6)** — enforced by a UNIQUE constraint on `(RecordId, WorkspaceId)` in `Requests` plus a check at the escalate endpoint that no AI-side row exists for the given `RecordId` yet. A mistaken escalation is resolved by closing the AI-side record with a reason; there is no de-escalation code path.

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
