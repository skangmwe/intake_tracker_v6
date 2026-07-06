---
slice: 21-sla-timeinstage
capability: Records show aging tint on the Requests list, live time-in-stage on the Record detail, and SLA Status (On track / Due soon / Overdue) derived from Due Date.
spec-section: BS §3.1, §3.3, §10.6, §17.2
started: 2026-07-06T15:57:44-04:00
ended: 2026-07-06T16:28:11-04:00
duration: 00:30:27
---

# Slice 21 — SLA Status + time-in-stage + condition-engine current-date

Decisions worth carrying forward (the diff + commit cover the mechanics):

1. **SLA Status + time-in-stage are derived at read time in the C# service, not in SQL.**
   The slice plan said "computed columns where possible; view functions for the rest." Both
   values depend on **current-date**, which is non-deterministic — SQL Server refuses to
   PERSIST such a computed column (the existing `DueDate` column is already un-persisted for
   the same reason). So there is no "computed column" case here; both are the "view functions
   for the rest" case. Rather than add SQL scalar functions, they reuse the module's existing
   derivation pattern (`DeriveDisplayStatus` / `DeriveMirrorStatus` are already C#) via
   `ComputeSla` / `ComputeTimeInStage` in `RequestsService.Reads.cs`. The procs only surface
   the inputs (`DueDate`, `StageEnteredAt`, `DueSoonWindowDays`).

2. **`ComputeSla` went from list-only + hardcoded-3 to three-state on both surfaces.** Slice 5
   shipped a `ComputeSla(due, today)` that returned `Overdue`/`DueSoon`/`null` with a hardcoded
   3-day window, applied only on the list (detail was always `SlaStatus: null`). This slice made
   it `ComputeSla(due, today, window)` returning the full `OnTrack`/`DueSoon`/`Overdue` set, and
   wired it into detail (`MapRow`) as well. No due date still → `null` (no pill, no tint).

3. **The "due soon" window is a single `Workspaces.DueSoonWindowDays` column (default 3), not a
   settings table, and there is no admin editor this slice.** The spec calls it "a workspace-level
   config value" — a column is the minimal home. An editor UI can fold into workspace admin later;
   the column + default is enough for the derivation to be real now.

4. **Time-in-stage needs a stage-entry timestamp; `StageEnteredAt` is stamped, not derived from
   audit history.** Migration 048 adds the column (backfilled to `Submitted` for existing rows).
   `usp_CreateRequest` stamps it; `usp_SetRequestStage` resets it **only when the stage actually
   changes** (`CASE WHEN Stage <> @ToStage …`) so a no-op same-stage set never restarts the clock.
   This is deterministic and avoids an audit-table scan per read.

5. **Condition-engine current-date is genuine spec work (§3.1/§3.3), not SLA plumbing.** `ConditionEngine`
   now takes `IClock` and exposes `Today()`, a `@today`/`@now`/`@currentDate` token resolved in a
   rule's compare value, date-aware `eq`/`lt`/`gt`/… comparisons, and the `DateDifferenceDays`
   primitive (§3.3 numeric substrate). This is the substrate a configurable Calculation/DerivedCategory
   field uses; it is exercised by unit tests. SLA/time-in-stage deliberately do **not** route through
   the engine instance — trivial `DateOnly` day-math kept in the Requests service avoids coupling the
   module to the Rules engine for a subtraction.

6. **Prototype divergence (resolved per handoff rules — prototype hook, Phase-2 fill).** The prototype
   renders a binary SLA slot (`On track` / `Overdue`). Slice 21 fills that same slot with the three-state
   derivation (§17.2) as a `StatusPill`, and adds a **Time in stage** item to the meta strip (the
   prototype has no time-in-stage — it is a spec-driven meta-strip addition styled to match).

Build note: `api/Api` and `api/Api.Tests` compile clean (0 warnings / 0 errors). Web `tsc`/`jest`/`eslint`
could not run locally (no `node_modules` installed in this environment) — they run at the `/dev-ship`
quality gate. tSQLt + xUnit + jest cases were authored in-slice.
