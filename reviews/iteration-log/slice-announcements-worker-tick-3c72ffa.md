# slice-announcements-worker-tick-3c72ffa — iteration log

**Label:** slice-announcements-worker-tick-3c72ffa
**Scope source:** uncommitted working tree (git status --porcelain)
**Files reviewed (source):** api/Api/Data/AppDbContext.cs, api/Api/Data/Entities.cs,
api/Api/Modules/Announcements/AnnouncementsService.cs,
api/Api/Modules/Announcements/AnnouncementSchedulerOptions.cs,
api/Api/Modules/Announcements/AnnouncementTickGateway.cs,
api/Api/Modules/Announcements/AnnouncementSchedulerService.cs,
api/Api/Program.cs, api/Api/appsettings.json
**Files reviewed (tests):** api/Api.Tests/AnnouncementSchedulerServiceTests.cs
**Layers in scope:** API only (no `.sql`, no frontend → no design-conformance / design-fidelity gate)
**Final status:** CLEAN

## Iteration 1 — 1 code finding, 0 security findings, 0 test failures

### Phase 0 — unit tests
- Authored in-slice: `AnnouncementSchedulerServiceTests` (6 tests). Required cases per
  `api-testing-guidelines.md`: happy path (emit-per-row, shared OperationId), no-op sweep, permanent
  failure (gateway/tick throws → propagates, no emit), per-row fan-out resilience, timer-invokes-sweep +
  clean cancellation, cancel-before-first-sweep. All pass.
- `AnnouncementTickGateway` is a thin EF `FromSqlRaw` wrapper over `usp_TickAnnouncements` — not
  unit-mockable; the proc's flip semantics are covered by the slice-1 tSQLt suite. `AnnouncementSchedulerOptions`
  is a POCO (no branching). No missing required case; no slice authoring gap.
- Full API suite: 685 passed / 0 failed.

### Phase 1 — code review (api-middletier.md)
- [Mechanical / Medium] `AnnouncementSchedulerService.RunTickAsync` — a fan-out failure mid-sweep aborted
  the whole sweep, but `usp_TickAnnouncements` has already committed each row as Published, and a later
  sweep never re-returns already-flipped rows — so every row after the failure permanently loses its
  notification. Applied the codebase's batch-failure convention (document-upload: a failed item does not
  block the batch): per-row try/catch that continues, logs the failed `{AnnouncementId}`, and still never
  duplicates (flipped rows are never re-emitted). Cancellation (`OperationCanceledException`) still
  propagates to abort the sweep. Added test `RunTickAsync_WhenOneRowFanOutFails_StillEmitsTheRemainingRows`.
  Re-ran the suite after the source change: 685 passed.
- Cancellation tokens threaded through every async method; `ConfigureAwait(false)` in the non-pipeline
  hosted-service/gateway code; Scoped `AppDbContext`/`IAnnouncementsService` resolved per sweep via
  `IServiceScopeFactory` (never into the singleton BackgroundService); `IOptions<T>` for the period;
  structured logging with `OperationId` (LogContext) and no PII — all conformant. `UserId` is absent by
  design on a system sweep (no user principal), matching the existing `ImportProcessor` hosted-service
  precedent.

### Phase 2 — security review (api-middletier-security.md)
- No findings. No new endpoint/authorization surface (system background task). `FromSqlRaw` SQL is a
  compile-time constant with no dynamic values (no injection). `appsettings` addition is non-secret config
  (a period). No PII in logs (counts, duration, record-id). No new NuGet packages. Keyless `AnnouncementTickRow`
  is a DB read-projection, never model-bound from HTTP.

### Developer decisions
- No architectural findings to batch.

## Final Status: CLEAN
- Total iterations: 1
- Total findings fixed: 1 (mechanical, auto-applied)
- Architectural deferred: 0
- Architectural rejected: 0
