---
slice: 01-foundation
capability: the platform stands up with a seeded AI Solutions workspace and a PG/Dept template, both discoverable by an SSO'd user
spec-section: BS §1, §4, §6.7, §12, §17.1; Requirements §4
started: 2026-07-03T13:05:00-04:00
ended: 2026-07-03T13:53:18-04:00
duration: 00:48:18
---

# Slice 1 — Foundation

Database backbone + core infrastructure. No screens; every downstream slice depends on this.

## Decisions worth keeping

1. **`PlatformAdminGrant` is the single source of truth for the firm-wide Platform admin grant.** The data-model draft also showed an `IsPlatformAdmin` column on `WorkspaceMembership`; that duplicate was dropped (two sources for one fact drift apart). `MeDto.isPlatformAdmin` is computed from the grant table. (data-model.md updated.)

2. **Always-Encrypted on `Users.DisplayName`/`Email` is a deploy step, not a migration step.** AE needs a Column Master Key (Key Vault) + Column Encryption Key that don't exist on a bare LocalDB/dev instance. The migration creates plain `NVARCHAR`; converting to `ENCRYPTED WITH (...)` is a staging/prod deploy prerequisite. **Runbook for deploy:** provision CMK in Key Vault → create CEK → `ALTER TABLE dbo.Users ALTER COLUMN` the two PII columns to Always-Encrypted before real user data lands.

3. **`usp_MintRecordId` and `usp_EmitAuditEntry` are transaction-free single statements.** They are designed to run *inside the caller's* transaction (mint → insert record; state-change → audit). An internal `BEGIN TRAN`/CATCH-`ROLLBACK` would unwind the *caller's* work and also breaks tSQLt's transaction management. `SET XACT_ABORT ON` handles error propagation; the multi-statement *seed* migrations keep their explicit transactions.

4. **The event spine writes audit in-process, then fans out on Service Bus.** Audit is the same-request consumer (durable, atomic with the state change via the caller's `DbContext`); Mirror/Notifications/Dashboards are cross-service consumers that read off Service Bus in later slices. `ServiceBusPublisher` no-ops when `ServiceBus:Namespace` is unset, so local/dev and the health probe run without Service Bus.

5. **`BoundDashboardId` FK deferred.** Column added nullable now; its FK to `SavedDashboard` lands in slice 23 when that table exists.

## Runbook — migration apply order

`database/migrations/` is forward-only and numbered. Apply `20260703_002` → `20260703_012` in order (schema `002–009` before seeds `010–012`; `010` before `011`/`012`). Then apply the `database/procedures/` files (idempotent `CREATE OR ALTER`). Each has an idempotent `_Rollback.sql`.

## Layers touched

Database (8 tables + append-only trigger, 3 procs, 3 seed data-migrations, 4 tSQLt suites) · API (EF `DbContext` + entities + soft-delete filter, real `EventSpine` + `AuditWriter` + `ServiceBusPublisher`, Serilog, `SystemClock`, DI wiring) · API tests (xUnit for `EventSpine` + `ServiceBusPublisher`).

Build: `dotnet build Api.sln` → 0 warnings, 0 errors (warnings-as-errors on). Tests authored; executed at slice-completion by `/dev-review-and-remediate`.
