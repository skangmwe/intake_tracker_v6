# Time-Based Triggers — Design Spec

**Date:** 2026-07-24
**Status:** Draft (brainstormed, pending review)
**Release phase:** Release 2 / Phase 3 (build spec §15) — the time-based-trigger half. Email delivery, per-user notification preferences, digests, and the REST API + webhooks are **explicitly deferred** to when the app is fully in the dev environment. The AI-assist layer (§14) is a **separate later cycle** with its own spec.

---

## 1. Goal

Finish the Phase 3 **time-based triggers**: a scheduled engine that, once a day, evaluates records against time-based conditions and fires **in-app notifications** — proactively chasing overdue Requests, the Benefit-review-date prompt (§17.11), overdue Tasks, and stalled Approval Requests. Delivered on the app's existing infrastructure (the condition engine §3, the event spine + notifications, the `AnnouncementSchedulerService` pattern) with no new external dependencies.

**Delivery channel this cycle is in-app notifications only.** Email/digests reuse the same trigger events later; they are out of scope here per the deferral above.

---

## 2. Scope

### In scope

1. **Trigger engine core** — a generic scheduled-trigger engine (Tier C): tables, a once-daily sweep, a fire-once/re-nag watermark, and a `trigger.fired` event that fans out through the existing notification path.
2. **Request authored triggers + admin authoring UI** — a no-code screen where a workspace admin composes arbitrary time-condition → notify rules over Request fields, reusing the condition engine. The two spec triggers ship as seeded rows.
3. **Benefit-review-date default** — auto-populate the existing (currently manual-only) `benefitReviewDate` field as `Deploy Date + N days` (N = a new workspace setting, seed **90**).
4. **Task Due Date** — a first-class `Due Date` field on the Task object, plus a built-in **Task-overdue** trigger type.
5. **Approval respond-by** — a `RespondByDate` on `ApprovalRequest`, stamped when the gate opens (default `OpenedAt + N days`, window a setting), plus a built-in **Approval-overdue** trigger type.

### Out of scope (deferred)

- Email delivery, per-user notification preferences beyond what exists, digests — Phase 3, deferred to full dev environment.
- REST API + webhooks — Phase 3, deferred.
- The AI-assist layer (duplicate detection, link suggestions, summarisation, drafting, reuse detection, §14) — Phase 4, its own spec/plan/build cycle.
- Exposing an admin edit UI for the existing SLA `DueSoonWindowDays` setting — the SLA trigger reads the column as-is; a settings-editor surface is not required by this cycle.

---

## 3. Architecture

### 3.1 The hybrid model

The engine evaluates authored `ConditionRule`s over a record's **field-value map**. Request has a rich field map, so it gets the full generic treatment. Task has only a thin fixed field set and Approval Request is its own column-shaped table with no field map — so those two cannot be authored as "field + comparator + value" rules. The design is therefore **hybrid**, one engine with two trigger flavours:

- **Request → generic, admin-authored.** Admins compose arbitrary time-conditions over Request fields in the authoring UI. Conditions reuse `ConditionRule` and are evaluated by `IConditionEngine.Evaluate`. The two seeded triggers (SLA-breach, Benefit-review) are pre-authored rows.
- **Task-overdue & Approval-overdue → built-in trigger *types*.** Their condition is fixed by definition (`Task.DueDate < @today AND status Open`; `ApprovalRequest.RespondByDate < @today AND State Open`). The admin does not hand-build the condition — they **enable the type and configure** on/off, the window (N days), recipients, and fire cadence. Same engine, sweep, watermark, and fan-out; only the condition shape differs (fixed vs authored).

One engine, one admin surface (a list of triggers — some authored, some built-in-and-configured), without pretending Task/Approval have a field map they don't.

### 3.2 Reused building blocks (no reinvention)

| Concern | Existing component | File |
|---|---|---|
| Condition shape + evaluator | `ConditionRule`, `IConditionEngine.Evaluate(rule, fieldValues, currentUserId?)` — date-aware comparators, `@today` token, `DateDifferenceDays` | `api/Api/Shared/Rules/ConditionEngine.cs` |
| Authored-rule persistence precedent | `FieldRule` / `FieldRuleDependency` tables, `RulesEditor.tsx` UI | `api/Api/Data/Entities.cs`, `web/src/features/fields/components/RulesEditor.tsx` |
| Time source | `IClock` (never `DateTime.UtcNow` directly) | `api/Api/Shared/Time/IClock.cs` |
| Scheduler pattern | `AnnouncementSchedulerService` (BackgroundService, per-sweep DI scope, catch-and-continue, cancellation-clean) | `api/Api/Modules/Announcements/AnnouncementSchedulerService.cs` |
| Notification emission | `IEventSpine.EmitAsync(EventEnvelope)` → `AuditWriter` → `NotificationFanout` → Service Bus (no-op in dev) | `api/Api/Shared/EventSpine/EventSpine.cs` |
| Recipient fan-out | `usp_FanOutNotification` — resolves audience; already fans out to a payload id-list (the @mention path) | `database/procedures/notifications/usp_FanOutNotification.sql` |
| Existing reminder preference | `WatcherNotificationPreference.NotifySlaAndDueDateReminders` (flag exists; no category mapped yet) | `api/Api/Data/Entities.cs` |
| SLA compute precedent | `RequestsService.ComputeSla` (on-read, hard-coded — the trigger evaluates the same underlying condition, it does not read an SLA field) | `api/Api/Modules/Requests/RequestsService.Reads.cs` |

### 3.3 Data model (migration 080+ — verify next free number at plan time)

All tables are **object-agnostic** (`ObjectType` column) so the engine is not Request-locked, even though only Request is authorable this cycle.

- **`dbo.ScheduledTrigger`** — one row per trigger.
  - `TriggerId` (PK), `WorkspaceId`, `ObjectType`, `Kind` (`Authored` | `TaskOverdue` | `ApprovalOverdue`), `Name`, `IsEnabled`.
  - `Cadence` (`Once` | `RepeatEveryNDays`), `RepeatIntervalDays` (nullable).
  - `WindowDays` (nullable — the "N days" for built-in types; e.g. approval respond-by grace, or a due-soon lead).
  - `Recipients` (JSON — which user-reference field keys to notify: `assignedAnalyst` / `businessOwner` / `requestor` / `watchers`, or the built-in type's natural audience such as approval-eligible members).
  - `NotificationTitle`, `NotificationBody` (template text; no PII baked in).
  - 6 audit columns + `IsDeleted` / `DeletedAt` (soft delete).
- **`dbo.ScheduledTriggerCondition`** — ANDed "when" rows for `Authored` triggers, mirroring `FieldRule`.
  - `TriggerId` (FK, indexed), `WhenFieldKey`, `Comparator`, `CompareValue` (nullable), `SortOrder`. Empty for built-in kinds.
- **`dbo.ScheduledTriggerFire`** — the fire-once / re-nag watermark.
  - `TriggerId` (FK, indexed), `RecordId`, `LastFiredDate` (`DATE`). Unique on `(TriggerId, RecordId)`.
  - **Semantics:** `Once` → a row's presence blocks any re-fire forever (fires only on the first matching day). `RepeatEveryNDays` → re-fire when `LastFiredDate + RepeatIntervalDays <= @today`.

### 3.4 The sweep

`ScheduledTriggerService : BackgroundService`, modelled on `AnnouncementSchedulerService`:

- **Once-daily evaluation at a fixed hour** (a config constant, default `10:00`; timezone handling — see Open Questions). The service may tick more frequently but only runs the evaluation if today's sweep has not yet run (guarded by a per-workspace sweep watermark), so a restart never double-fires and a missed hour still runs late that day.
- Per sweep, per enabled trigger, per candidate record:
  1. A **SQL pre-filter proc** returns coarse candidates (date column set and past/at threshold, record not closed) so the sweep does not load every record. Built-in types filter their own tables (`Tasks`, `ApprovalRequests`); authored Request triggers pre-filter on the relevant date column where possible, then fine-evaluate.
  2. **Fine check** in C#: `Authored` → `IConditionEngine.Evaluate` over the record's field values; built-in → the fixed condition.
  3. **Watermark check** (`ScheduledTriggerFire`) applies the cadence rule.
  4. On a fire: resolve recipient user-ids (from the trigger's recipient field keys / built-in audience), emit a `trigger.fired` `EventEnvelope` carrying `{ triggerId, recordId, recipientUserIds[], title, body }`, and upsert the watermark.
- Runs in its own DI scope per sweep; a sweep that throws is logged (counts + `OperationId` only, no PII) and retried next day; cancellation (host shutdown) exits cleanly.

### 3.5 Notification fan-out

Extend `usp_FanOutNotification` with a `trigger.fired` event → per-kind categories (`sla-reminder` / `benefit-review` / `task-overdue` / `approval-overdue`). Audience is resolved from the payload `recipientUserIds[]` — the same mechanism the @mention path already uses — so no new fan-out topology is invented. Honor `WatcherNotificationPreference.NotifySlaAndDueDateReminders` for the due/SLA categories (wire the currently-unmapped flag). Actor-exclusion, disabled-account suppression, and dedup are inherited unchanged. Each fired reminder lands in the **audit** automatically because `AuditWriter` runs first in the event spine.

Recipients are, by construction, users who hold a user-reference field on the record (Assigned Analyst, Business Owner, Requestor, Watchers) or an eligible approver — all of whom can already see the record, so the permission-respecting guarantee holds without extra checks.

---

## 4. Natural slice boundaries

The plan should stage this rather than land it as one change. Suggested cut (each ships a working increment):

1. **Engine core** — the three tables, `ScheduledTriggerService` sweep, `trigger.fired` event, `usp_FanOutNotification` extension, watermark. No authored UI yet; prove it with one seeded built-in or a temporary seeded row.
2. **Request authored triggers + admin UI** — authoring screen (RulesEditor-grammar), CRUD endpoints, the two seeded Request triggers (SLA-breach, Benefit-review).
3. **Benefit-review-date default** — the `Deploy Date + N` computation + the N-days workspace setting (seed 90); recompute-on-Deploy-Date-change per the Open Question resolution.
4. **Task Due Date** — the first-class Task field (schema + detail/edit UI + list column) and the built-in Task-overdue trigger type.
5. **Approval respond-by** — `RespondByDate` on `ApprovalRequest` (stamp at open, window setting), and the built-in Approval-overdue trigger type.

Slices 3–5 each depend only on slice 1 (the engine) and slice 2 (the admin surface that lists/configures triggers); they are otherwise independent and could ship in any order.

---

## 5. Cross-cutting requirements (must honor)

- **Migrations** — idempotent (`IF NOT EXISTS`) with rollbacks; one logical change per file; numbered from the next free number (verify at plan time — uncommitted custom-object worktrees may consume 080+). New tables carry PK + 6 audit columns + soft-delete; every FK gets a non-clustered index.
- **Scheduler** — `IServiceScopeFactory` per sweep (never resolve Scoped services into the singleton); `IClock` for all time; catch-and-continue; `CancellationToken` throughout.
- **Notifications/PII** — never log notification content, recipient identities, or record field values; log counts + `DurationMs` + `OperationId` only (`api-logging.md`, `api-pii-handling.md`).
- **Stored procs** — `SET NOCOUNT/XACT_ABORT ON`, `CREATE OR ALTER`, parameterized, header comment; the pre-filter/fan-out procs follow `database-stored-procedures.md`.
- **API** — controllers thin; ProblemDetails on error; ownership/admin checks on trigger CRUD (workspace-admin only); pagination on any trigger list endpoint.
- **Tests** — xUnit for the sweep service (happy path, a failing-record-continues-batch case, cancellation, watermark once-vs-repeat, condition-true/false branches, empty-recipients); tSQLt for the pre-filter and fan-out procs (happy, NULL/empty, dedup); jest + jest-axe for the authoring UI (loading/error/empty/populated states) and any Task/Approval field UI.

---

## 6. Open questions (resolve at plan time)

1. **Timezone of the daily hour.** Default is a fixed hour in one timezone (UTC or firm-local). A multi-office firm may want workspace-local. Recommendation: ship a single configured hour (constant), flag per-workspace timezone as a later enhancement — do not build timezone handling now unless required.
2. **Benefit-review recompute.** When `Deploy Date` changes after `benefitReviewDate` was auto-set, do we recompute? Recommendation: recompute only if the user has not manually overridden the field (track an "auto vs manual" flag or recompute-if-unedited). Confirm the exact rule.
3. **Approval respond-by window source.** Per-gate override vs a single per-workspace default. Recommendation: one per-workspace default setting for this cycle; per-gate override deferred.
4. **Built-in type instancing.** ~~One configurable Task-overdue / Approval-overdue instance per workspace, seeded **disabled** (opt-in) vs **enabled**.~~ **Resolved: seeded disabled, admin opts in** — avoids surprise notifications on first deploy. (Adopted.)
5. **Notification category granularity.** One `trigger-reminder` category vs per-kind categories. Recommendation: per-kind (`sla-reminder`, `benefit-review`, `task-overdue`, `approval-overdue`) so per-user preferences can grow per-kind later without a migration. (Adopted above.)

---

## 7. Explicit deferrals (recorded so the boundary stays clear)

Email delivery · per-user notification preferences beyond the existing flag · digests · REST API + webhooks · the entire AI-assist layer (§14). These bolt onto the `trigger.fired` event and the trigger tables this cycle builds — nothing here forecloses them.
