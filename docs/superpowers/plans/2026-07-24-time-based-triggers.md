# Time-Based Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This repo's commit discipline overrides the generic per-step `git commit`.** Direct `git commit` is blocked by a PreToolUse hook. Each slice is implemented in its own worktree (via `bash .claude/hooks/begin-change.sh --type slice <name>`), verified with the project gate `/dev-review-and-remediate`, and committed **only** through `/dev-ship`. Do not hand-commit. Within a slice, "run the tests" means the layer's gate (`dotnet test`, `npm run test:coverage`, tSQLt in CI).

**Goal:** Ship the Phase 3 time-based triggers — a once-daily scheduled engine that fires in-app notifications to chase overdue Requests, the Benefit-review prompt, overdue Tasks, and stalled Approval Requests — plus the supporting Task Due Date, Approval respond-by date, and Benefit-review-date default.

**Architecture:** One hybrid engine on the existing `AnnouncementSchedulerService` BackgroundService pattern. Request triggers are admin-authored `ConditionRule`s evaluated by the existing `IConditionEngine`; Task-overdue and Approval-overdue are built-in fixed-condition trigger types. Firing emits a `trigger.fired` event through the existing event spine → `usp_FanOutNotification`, reusing the payload-id-list (@mention) audience path. No new external dependencies.

**Tech Stack:** ASP.NET Core (net10.0), EF Core + stored procedures (Azure SQL), React 19 + TypeScript + SCSS Modules (webpack, Node 24), Serilog, xUnit / tSQLt / jest + jest-axe.

## Global Constraints

- **Source spec:** `docs/superpowers/specs/2026-07-24-time-based-triggers-design.md`. Build spec authority: `artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md` §15 (Phase 3), §17.2 (SLA), §17.11 (Benefit-review), §7 (gates), §2.4 (Task).
- **Read the governing rule files before writing code for each task** (root `CLAUDE.md` mandatory pre-implementation step). Pointers are named per task.
- **Do not invent limits/thresholds.** Every default (window days, seed 90, page size, sweep hour 10:00) traces to the spec or a rule; none invented. `api-coding-standards.md`.
- **Delivery channel is in-app notifications only.** No email, digests, per-user prefs beyond the existing `NotifySlaAndDueDateReminders` flag, REST API, or webhooks this cycle.
- **Time:** all time via `IClock` (`api/Api/Shared/Time/IClock.cs`) — never `DateTime.UtcNow` directly.
- **Scheduler:** `IServiceScopeFactory` per sweep; never resolve Scoped services into the singleton; catch-and-continue; `CancellationToken` through every async call. Model: `api/Api/Modules/Announcements/AnnouncementSchedulerService.cs`.
- **PII/logging:** never log notification content, recipient identities, or record field values; log counts + `DurationMs` + `OperationId` only. `api-logging.md`, `api-pii-handling.md`.
- **DB:** every table gets PK + 6 audit columns + `IsDeleted`/`DeletedAt`; every FK a non-clustered index; migrations idempotent (`IF NOT EXISTS`) with rollbacks, one logical change per file. Procs: `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, parameterized, header comment. `database-coding-standards.md`, `database-migrations.md`, `database-stored-procedures.md`.
- **Migration numbering:** next free number is **080+**, but uncommitted custom-object worktrees may consume 080/081 — **`ls database/migrations/` at the start of each DB task and take the next free number**. Do not assume.
- **API:** controllers thin; ProblemDetails on error; workspace-admin authorization on all trigger CRUD; pagination on list endpoints (default 20, max 100). `api-error-handling.md`, `api-validation.md`, `api/CLAUDE.md`.
- **Web:** feature-folder structure; `data-ds` on every design-system component; every remote-data component renders loading/error/empty explicitly; colocated `.test.tsx` with jest-axe across meaningful states; tokens only (no raw hex/radii). `web-component-architecture.md`, `web-styling.md`, `web-testing.md`.
- **Tests ship in the same slice** — never deferred. xUnit service cases: happy / permanent-failure-no-retry / cancellation, plus every branch. tSQLt: happy / NULL-empty / error. `api-testing-guidelines.md`, `database-testing.md`, `web-testing.md`.

---

## Slice sequencing

Each slice is a shippable increment behind its own worktree + `/dev-ship`.

1. **Engine core** (DB + API BackgroundService + fan-out) — no UI. Proven by tests + one temporary seeded row.
2. **Request authored triggers + admin UI** — CRUD + authoring screen + the two seeded Request triggers.
3. **Benefit-review-date default** — Deploy-Date+N computation + N-days setting.
4. **Task Due Date** — first-class field + built-in Task-overdue type.
5. **Approval respond-by** — `RespondByDate` + built-in Approval-overdue type.

Slices 3–5 depend only on 1 + 2 and are otherwise independent.

---

# SLICE 1 — Engine core

**Read first:** `api-worker.md` (idempotency/scheduler discipline — the in-process analogue), `api-performance.md` (BackgroundService, no long work on request thread), `database-coding-standards.md`, `database-stored-procedures.md`, `api-logging.md`, `api-pii-handling.md`, and re-read `AnnouncementSchedulerService.cs` + `EventSpine.cs` + `usp_FanOutNotification.sql`.

### Task 1.1: Schema — the three trigger tables

**Files:**
- Create: `database/migrations/<NNN>_CreateScheduledTriggers.sql` (+ `_Rollback.sql`) — `<NNN>` = next free number (check `ls database/migrations/`).
- Create: `database/migrations/<NNN+1>_CreateScheduledTriggerConditions.sql` (+ rollback).
- Create: `database/migrations/<NNN+2>_CreateScheduledTriggerFires.sql` (+ rollback).

**Interfaces (Produces):** tables `dbo.ScheduledTrigger`, `dbo.ScheduledTriggerCondition`, `dbo.ScheduledTriggerFire` with the columns below. Later tasks bind EF entities/procs to these exact names.

- [ ] **Step 1: Write `dbo.ScheduledTrigger`** — columns: `TriggerId UNIQUEIDENTIFIER PK DEFAULT NEWID()`, `WorkspaceId UNIQUEIDENTIFIER NOT NULL` (FK → `Workspaces`, indexed), `ObjectType NVARCHAR(64) NOT NULL`, `Kind NVARCHAR(32) NOT NULL` (`CK` in `Authored`/`TaskOverdue`/`ApprovalOverdue`), `Name NVARCHAR(200) NOT NULL`, `IsEnabled BIT NOT NULL DEFAULT 0`, `Cadence NVARCHAR(32) NOT NULL` (`CK` in `Once`/`RepeatEveryNDays`), `RepeatIntervalDays INT NULL`, `WindowDays INT NULL`, `Recipients NVARCHAR(MAX) NOT NULL DEFAULT N'[]'` (JSON), `NotificationTitle NVARCHAR(200) NOT NULL`, `NotificationBody NVARCHAR(MAX) NOT NULL`, + 6 audit columns + `IsDeleted BIT NOT NULL DEFAULT 0` + `DeletedAt DATETIME2 NULL`. Idempotent `IF NOT EXISTS`. Index `IX_ScheduledTrigger_WorkspaceId`.
- [ ] **Step 2: Write `dbo.ScheduledTriggerCondition`** — `ConditionId PK`, `TriggerId` (FK → `ScheduledTrigger`, `IX`), `WhenFieldKey NVARCHAR(128) NOT NULL`, `Comparator NVARCHAR(32) NOT NULL`, `CompareValue NVARCHAR(MAX) NULL`, `SortOrder INT NOT NULL DEFAULT 0`, + 6 audit + soft-delete. Mirrors `FieldRule` shape (see `Entities.cs` `FieldRuleRow`).
- [ ] **Step 3: Write `dbo.ScheduledTriggerFire`** — `FireId PK`, `TriggerId` (FK, `IX`), `RecordId NVARCHAR(64) NOT NULL`, `LastFiredDate DATE NOT NULL`, + 6 audit. `UNIQUE (TriggerId, RecordId)` filtered `WHERE IsDeleted = 0` if soft-delete added, else plain unique. Add a per-workspace sweep-log table OR reuse a column — **decision:** create `dbo.ScheduledTriggerSweepLog` (`WorkspaceId`, `SweepDate DATE`, `RanAt DATETIME2`, unique `(WorkspaceId, SweepDate)`) for the once-per-day guard (§3.4). Put this in the same migration file as a second `IF NOT EXISTS` block since it's one logical concern (the watermark).
- [ ] **Step 4: Write all three rollback scripts** (idempotent `DROP ... IF EXISTS`, child-before-parent order: Fires/SweepLog → Conditions → Trigger).
- [ ] **Step 5: Apply locally & verify** — per `[[dev-ship-gotchas]]`, apply via PowerShell `Invoke-Sqlcmd` against `AiSolutionsTrackerDev` (tSQLt is CI-only). Confirm tables exist and rollbacks drop cleanly, then re-apply forward.

### Task 1.2: EF entities + DbSets

**Files:**
- Modify: `api/Api/Data/Entities.cs` (add `ScheduledTriggerRow`, `ScheduledTriggerConditionRow`, `ScheduledTriggerFireRow` projection classes, following the existing `*Row` convention).
- Modify: `api/Api/Data/AppDbContext.cs` (register entities if read via EF; procs if read via `FromSqlRaw` — prefer procs for reads/writes per `api-data-access.md`, EF only for single-table).

**Interfaces (Produces):** C# row types matching the table columns; `Kind`/`Cadence`/`Comparator` as `string` (JSON enum-as-string convention, `api-coding-standards.md`).

- [ ] **Step 1:** Add the three row classes with properties matching Task 1.1 columns exactly.
- [ ] **Step 2:** Register in `AppDbContext` (`modelBuilder.Entity<...>().ToTable(...)`, keyless where proc-projected, per existing patterns).
- [ ] **Step 3:** `dotnet build api/Api` — expect clean.

### Task 1.3: Pre-filter + fan-out procs

**Files:**
- Create: `database/procedures/triggers/usp_GetTriggerCandidates.sql` — returns coarse candidate records for a given enabled trigger.
- Modify: `database/procedures/notifications/usp_FanOutNotification.sql` — add the `trigger.fired` event family.
- Create/modify tSQLt tests under `database/tests/`.

**Interfaces (Produces):**
- `usp_GetTriggerCandidates @TriggerId, @Today DATE` → rows of `RecordId` (+ `FieldValuesJson` for Authored Request triggers; the built-in kinds return their own tables' candidate rows — see per-slice tasks 4/5). For Slice 1 implement the **Authored/Request** path only (coarse filter: matching `ObjectType`, not-closed, and — where the trigger's conditions reference a date column that is a first-class Request column like `DueDate` — a `WHERE` on it; otherwise return all non-closed and let C# fine-filter).
- `usp_FanOutNotification` gains: `@Type = 'trigger.fired'` → category from payload `kind` (`sla-reminder`/`benefit-review`/`task-overdue`/`approval-overdue`), audience = payload `recipientUserIds[]` parsed via `OPENJSON` (same pattern as the existing @mention id path, ~line 100), honoring `WatcherNotificationPreference.NotifySlaAndDueDateReminders` for `sla-reminder`/`task-overdue`/`benefit-review`/`approval-overdue` categories, actor-excluded, disabled-suppressed, dedup unchanged.

- [ ] **Step 1:** Write `usp_GetTriggerCandidates` (Request/Authored path). Header comment, `SET NOCOUNT/XACT_ABORT ON`, parameterized.
- [ ] **Step 2:** Extend `usp_FanOutNotification` — add the `trigger.fired` branch and the per-kind category map; parse `recipientUserIds` from payload via `OPENJSON`; map the four categories through the reminder-preference filter.
- [ ] **Step 3: tSQLt tests** — `test_FanOut_TriggerFired_InsertsOneRowPerRecipient`, `test_FanOut_TriggerFired_ExcludesActor`, `test_FanOut_TriggerFired_SuppressesDisabled`, `test_FanOut_TriggerFired_HonorsReminderPreferenceOff`, `test_FanOut_TriggerFired_DedupsSameEvent`, and `test_GetTriggerCandidates_ExcludesClosed` / `_ReturnsMatchingObjectType` / `_EmptyWhenNoCandidates`. (Run in CI — tSQLt is not local.)

### Task 1.4: The sweep service

**Files:**
- Create: `api/Api/Modules/Triggers/ScheduledTriggerOptions.cs` (`DailyHourLocal` default `10`, `TickPollSeconds` default e.g. `300`).
- Create: `api/Api/Modules/Triggers/ScheduledTriggerService.cs` (`BackgroundService`).
- Create: `api/Api/Modules/Triggers/ScheduledTriggerEvaluator.cs` (Scoped — does one sweep; unit-testable without the timer).
- Create: `api/Api/Modules/Triggers/ITriggerGateway.cs` + `TriggerGateway.cs` (proc calls: list enabled triggers, get candidates, read/upsert watermark, read/write sweep-log).
- Modify: `api/Api/Program.cs` (register `AddHostedService<ScheduledTriggerService>()`, options, gateway, evaluator).
- Create tests: `api/Api.Tests/ScheduledTriggerEvaluatorTests.cs`.

**Interfaces:**
- Consumes: `IConditionEngine.Evaluate(ConditionRule, IReadOnlyDictionary<string,object?> fieldValues, Guid? currentUserId)`, `IEventSpine.EmitAsync(EventEnvelope, ct)`, `IClock`.
- Produces: `ScheduledTriggerEvaluator.RunDailySweepAsync(DateOnly today, CancellationToken)` → returns a count summary struct `{ int Evaluated, int Fired, int FailedFanOut }`. `ScheduledTriggerService` calls it once per day (guarded by sweep-log).

- [ ] **Step 1: Write the evaluator sweep (failing test first).** Test `RunDailySweep_AuthoredTrigger_ConditionTrue_EmitsTriggerFiredEvent`: arrange one enabled Authored trigger (`DueDate lt @today`) + one candidate record with `DueDate` in the past + no prior fire row; assert `IEventSpine.EmitAsync` called once with `EventType == "trigger.fired"` and payload carrying resolved `recipientUserIds` + `kind`, and a watermark upsert for `(triggerId, recordId, today)`.
- [ ] **Step 2:** Implement `RunDailySweepAsync`: for each enabled trigger → `usp_GetTriggerCandidates` → per record, fine-evaluate (`IConditionEngine.Evaluate` over field values for Authored; built-in kinds deferred to Slices 4/5), apply the watermark/cadence rule, resolve recipients from the trigger's `Recipients` field keys against the record's user-reference field values, emit `trigger.fired`, upsert watermark. Per-record try/continue (a failing record does not abort the sweep — mirror `AnnouncementSchedulerService`).
- [ ] **Step 3: Cadence tests** — `Once_DoesNotRefireWhenWatermarkExists`, `RepeatEveryNDays_RefiresWhenIntervalElapsed`, `RepeatEveryNDays_DoesNotRefireBeforeInterval`.
- [ ] **Step 4: Discipline tests** — `Cancellation_ExitsWithoutEmitting`, `FanOutThrowsForOneRecord_ContinuesOthers`, `NoCandidates_EmitsNothing`, `EmptyRecipients_SkipsEmit`.
- [ ] **Step 5: Write `ScheduledTriggerService`** on the `AnnouncementSchedulerService` template: `PeriodicTimer(TickPollSeconds)`; each tick, if the sweep-log has no row for `IClock` today AND the local hour ≥ `DailyHourLocal`, run `RunDailySweepAsync` in its own DI scope and record the sweep-log; catch-and-continue; cancellation-clean. Log counts + `DurationMs` + `OperationId` only.
- [ ] **Step 6:** Register in `Program.cs`. `dotnet test api/Api.Tests` green.
- [ ] **Step 7: Ship** — `/dev-review-and-remediate` then `/dev-ship` (slice branch `slice/triggers-engine-core`).

---

# SLICE 2 — Request authored triggers + admin UI

**Read first:** `api-validation.md`, `api-error-handling.md`, `web-component-architecture.md`, `web-styling.md`, `web-testing.md`, `web-state-management.md`; re-read `web/src/features/fields/components/RulesEditor.tsx` and `web/src/features/fields/components/FieldsAdminPage.tsx`.

### Task 2.1: Trigger CRUD service + controller

**Files:**
- Create: `api/Api/Modules/Triggers/TriggersService.cs`, `TriggersController.cs`, `TriggerDtos.cs`.
- Create: `database/procedures/triggers/usp_UpsertScheduledTrigger.sql`, `usp_GetWorkspaceTriggers.sql`, `usp_DeleteScheduledTrigger.sql` (soft delete) + tSQLt tests.
- Create: `api/Api.Tests/TriggersControllerTests.cs`, `TriggersServiceTests.cs`.

**Interfaces (Produces):** REST — `POST /v1/workspaces/{wsId}/triggers` (create), `GET /v1/workspaces/{wsId}/triggers` (paginated list), `GET /v1/workspaces/{wsId}/triggers/{id}`, `PUT .../{id}`, `DELETE .../{id}`. DTOs carry `kind`, `name`, `isEnabled`, `cadence`, `repeatIntervalDays?`, `recipients[]` (field keys), `notificationTitle`, `notificationBody`, and for `Authored`: `conditions[] { whenFieldKey, comparator, compareValue? }`.

- [ ] **Step 1:** Write the upsert/get/delete procs (workspace-scoped, soft-delete, `OPENJSON` for conditions like `usp_UpsertFieldDefinition` handles rules). tSQLt: happy / NULL-name-rejected / soft-delete-excludes / conditions-round-trip.
- [ ] **Step 2:** Service + controller. Workspace-admin authorization (mirror how `FieldsController` gates admin). Validate: `Authored` requires ≥1 condition and every `whenFieldKey` exists on the object; `RepeatEveryNDays` requires `repeatIntervalDays >= 1`; `recipients` non-empty; comparators from the engine's allowed set. Return `403` for non-admins, `400` ValidationProblem for bad input.
- [ ] **Step 3:** xUnit — happy create, `403` non-admin, `400` empty-conditions/empty-recipients, cancellation, pagination.
- [ ] **Step 4:** Wire the built-in candidate path is NOT here (Slices 4/5). This slice enables the evaluator's Authored path end-to-end against real CRUD'd triggers.

### Task 2.2: Seed the two Request triggers

**Files:**
- Create: `database/migrations/<NNN>_SeedRequestTimeTriggers.sql` (+ rollback).

- [ ] **Step 1:** Seed **SLA-breach** (AI Solutions workspace): `Kind=Authored`, `IsEnabled=0` (opt-in per spec Q4), `Cadence=RepeatEveryNDays` `RepeatIntervalDays=1`, condition `DueDate lt @today` (+ a not-closed guard if expressible as a condition; otherwise the candidate proc's closed-exclusion covers it), `Recipients=["assignedAnalyst"]`, title/body from spec voice (no PII, no exclamation — `ux-copy-and-microcopy.md`).
- [ ] **Step 2:** Seed **Benefit-review**: `Kind=Authored`, `IsEnabled=0`, `Cadence=Once`, condition `benefitReviewDate eq @today`, `Recipients=["businessOwner","watchers"]`.
- [ ] **Step 3:** Idempotent (`IF NOT EXISTS` on a stable seed key/name), rollback deletes by that key. Apply locally & verify.

### Task 2.3: Admin authoring UI

**Files:**
- Create: `web/src/features/triggers/` — `components/TriggersAdminPage.tsx`, `components/TriggerEditorSheet.tsx`, `components/TriggerConditionsEditor.tsx` (model on `RulesEditor.tsx`), `triggersModel.ts` (TanStack Query hooks), `types.ts`.
- Modify: `web/src/shared/components/Layout/adminNav.ts` (+ nav entry under Admin), `web/src/App.tsx` (route `/admin/triggers`).
- Create colocated `.test.tsx` with jest-axe for each component.

- [ ] **Step 1:** List page — table of triggers (name, kind, enabled toggle, cadence), loading/error/empty states, `data-ds` on each design-system element. Create/edit opens the sheet.
- [ ] **Step 2:** Editor sheet — name, enabled toggle, cadence (Once / Repeat-every-N-days with interval input), recipients multi-select (the four user-ref field keys), notification title/body. For `Authored`, embed `TriggerConditionsEditor` (repeatable `field + comparator + value` rows reusing the `RulesEditor` grammar + `@today` token option). Built-in kinds hide the conditions editor and show a fixed-condition description + window input (wired in Slices 4/5).
- [ ] **Step 3:** jest + jest-axe across states (loading, error, empty, populated, editor-open). userEvent flows; query by role/label.
- [ ] **Step 4: Ship** — `/dev-review-and-remediate` (includes design-fidelity + token gates) then `/dev-ship` (`slice/triggers-request-authoring`).

---

# SLICE 3 — Benefit-review-date default

**Read first:** re-read `RequestsService` write path; `api-data-access.md`.

### Task 3.1: Workspace setting for the offset

**Files:**
- Create: `database/migrations/<NNN>_AlterWorkspaces_AddBenefitReviewOffsetDays.sql` (+ rollback) — `BenefitReviewOffsetDays INT NOT NULL DEFAULT 90` (mirrors the `DueSoonWindowDays` column precedent, migration 049).
- Modify: `api/Api/Data/Entities.cs` (add to the Workspaces entity/row).

- [ ] **Step 1:** Column + default 90 (seed value from spec §16). Idempotent + rollback. No admin-edit UI this cycle (spec out-of-scope note) — the column is read-as-is.

### Task 3.2: Auto-populate on Deploy Date set

**Files:**
- Modify: the Request update path (`api/Api/Modules/Requests/…` write) or the seed/derivation where field values are persisted.
- Tests: `api/Api.Tests/…RequestsServiceTests` (new cases).

- [ ] **Step 1 (failing test):** `SetDeployDate_WhenBenefitReviewUnset_AutoPopulatesDeployPlusOffset`.
- [ ] **Step 2:** On write, if `deployDate` is set/changed **and** `benefitReviewDate` has not been manually overridden by the user, set `benefitReviewDate = deployDate + BenefitReviewOffsetDays`. **Resolved rule (spec Open Q2): recompute only if unedited** — a hand-set Benefit-review date is never clobbered; recompute applies to auto-set/null values only. Track with a small per-record "benefitReviewDateIsManual" marker set true whenever the user edits the field directly.
- [ ] **Step 3:** Tests — auto-set-when-unedited, do-not-overwrite-manual, no-deploy-date-no-op.
- [ ] **Step 4: Ship** — `/dev-review-and-remediate` then `/dev-ship` (`slice/benefit-review-default`).

---

# SLICE 4 — Task Due Date + built-in Task-overdue trigger

**Read first:** build spec §2.4 (Task), re-read Task entity + seed (`20260723_075_SeedTaskPlatformFields.sql`), `web` Task detail/edit components.

### Task 4.1: Task Due Date field (schema + API)

**Files:**
- Create: `database/migrations/<NNN>_AddTaskDueDate.sql` (+ rollback) — a first-class Task date field. Follow the seed-field pattern in migration 075 (add `dueDate` "Due Date" as a platform Task field) OR a first-class column on the Tasks table if that's how `completedAt` is modelled — match the existing Task date-field mechanism exactly (see `TaskRow.CompletedAt`).
- Modify: Task DTOs / service reads-writes to surface `dueDate`.
- Tests: task service + tSQLt as applicable.

- [ ] **Step 1:** Add the field consistent with how Task already stores `completedAt`. Idempotent + rollback.
- [ ] **Step 2:** Surface in Task read/write + DTO. Tests for round-trip + null.

### Task 4.2: Task Due Date UI

**Files:**
- Modify: Task detail/edit component(s) under `web/src/features/…` (task surfaces) + colocated tests.

- [ ] **Step 1:** Add a Due Date field (DateField) to the Task editor + show it on the Task row/detail. jest-axe across states.

### Task 4.3: Built-in Task-overdue candidate path + evaluator branch

**Files:**
- Modify: `database/procedures/triggers/usp_GetTriggerCandidates.sql` (add the `TaskOverdue` branch: open Tasks with `DueDate < @Today`).
- Modify: `api/Api/Modules/Triggers/ScheduledTriggerEvaluator.cs` (handle `Kind == TaskOverdue`: fixed condition, recipients = assignee, window optional lead).
- Modify: seed a disabled Task-overdue trigger row (migration).
- Tests: evaluator + tSQLt.

- [ ] **Step 1 (failing test):** `TaskOverdueTrigger_OpenTaskPastDue_EmitsTriggerFired` (recipient = assignee, kind `task-overdue`).
- [ ] **Step 2:** Candidate proc branch + evaluator branch (fixed condition, no authored conditions). Honor cadence/watermark identically.
- [ ] **Step 3:** Seed disabled `TaskOverdue` trigger (opt-in). Enable the built-in editor's window/recipients/cadence panel (Slice 2 UI) for this kind.
- [ ] **Step 4:** Tests — overdue-fires, not-yet-due-no-op, completed-task-excluded, cancellation.
- [ ] **Step 5: Ship** — `/dev-review-and-remediate` then `/dev-ship` (`slice/task-due-date`).

---

# SLICE 5 — Approval respond-by + built-in Approval-overdue trigger

**Read first:** build spec §7 (gates/sign-off), re-read `api/Api/Modules/Gates/ApprovalsService.cs`, `ApprovalRequestRow` (`Entities.cs`), migration `20260704_036_CreateApprovalRequests.sql`.

### Task 5.1: RespondByDate on ApprovalRequest

**Files:**
- Create: `database/migrations/<NNN>_AlterApprovalRequests_AddRespondByDate.sql` (+ rollback) — `RespondByDate DATE NULL`.
- Create: `database/migrations/<NNN+1>_AlterWorkspaces_AddApprovalRespondByDays.sql` (+ rollback) — `ApprovalRespondByDays INT NOT NULL DEFAULT 5` (per-workspace default; **spec Open Q3 resolved: seed 5**, admin-adjustable per workspace later; mirrors the `DueSoonWindowDays` column precedent).
- Modify: `ApprovalRequestRow` + the gate-open proc/service so `RespondByDate` is stamped `= OpenedAt + ApprovalRespondByDays` when a gate opens.
- Tests: gate service + tSQLt.

- [ ] **Step 1:** Columns (idempotent + rollback).
- [ ] **Step 2:** Stamp `RespondByDate` at gate open. Test `OpenGate_StampsRespondByDate = OpenedAt + window`.
- [ ] **Step 3:** Surface `RespondByDate` on the approval read/DTO so the record's task/approval list can show it (design-fidelity per prototype if present).

### Task 5.2: Built-in Approval-overdue candidate path + evaluator branch

**Files:**
- Modify: `usp_GetTriggerCandidates.sql` (`ApprovalOverdue` branch: `State = Open AND RespondByDate < @Today`).
- Modify: `ScheduledTriggerEvaluator.cs` (`Kind == ApprovalOverdue`: recipients = eligible approvers from the frozen approver set).
- Seed a disabled `ApprovalOverdue` trigger.
- Tests: evaluator + tSQLt.

- [ ] **Step 1 (failing test):** `ApprovalOverdueTrigger_OpenPastRespondBy_EmitsTriggerFired` (recipients = eligible approvers, kind `approval-overdue`).
- [ ] **Step 2:** Candidate proc branch + evaluator branch; resolve approver recipients from `FrozenApproverSet`.
- [ ] **Step 3:** Tests — overdue-open-fires, resolved-approval-excluded, before-respond-by-no-op, cancellation.
- [ ] **Step 4: Ship** — `/dev-review-and-remediate` then `/dev-ship` (`slice/approval-respond-by`).

---

## Self-review

- **Spec coverage:** §2 scope items 1–5 → Slices 1–5. In-app-only, once-daily 10:00, per-trigger cadence, hybrid model, opt-in-disabled seeds, per-kind categories, `NotifySlaAndDueDateReminders` wiring → all present (Tasks 1.1–1.4, 1.3, 2.1–2.3). Deferrals (§7) → none built. ✓
- **Open questions resolved:** Q1 timezone (Task 1.4 uses a single local hour; per-workspace timezone deferred), Q2 benefit-review recompute → **recompute only if unedited** (Task 3.2), Q3 approval window → **seed 5, admin-adjustable** (Task 5.1), Q4 opt-in (seeds `IsEnabled=0` throughout), Q5 per-kind categories (Task 1.3). ✓
- **Placeholder scan:** no open confirm-with-user flags remain; every value traces to spec/rules or a locked decision. ✓
- **Type consistency:** `trigger.fired` event type, `kind` values (`sla-reminder`/`benefit-review`/`task-overdue`/`approval-overdue`), `RunDailySweepAsync` signature, table/column names consistent across tasks. ✓
- **Migration numbering:** every DB task re-checks `ls database/migrations/` (numbering gotcha honored). ✓
