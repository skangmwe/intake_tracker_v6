# Unit tests added — slice-announcements-worker-tick-3c72ffa

## Iteration 1

**api/Api.Tests/AnnouncementSchedulerServiceTests.cs** (new, 6 tests — authored in-slice, extended once during Phase 1):
- `RunTickAsync_WithNewlyPublishedRows_EmitsOnePublishedEventPerRowWithSharedOperationId` — happy path:
  each tick row → exactly one `EmitPublishedAsync` with matching id/workspace/author and a single shared
  per-sweep OperationId.
- `RunTickAsync_WithNoDueRows_DoesNotEmitAnyEvent` — no-op sweep emits nothing.
- `RunTickAsync_WhenOneRowFanOutFails_StillEmitsTheRemainingRows` — per-row resilience (added in Phase 1
  alongside the source fix).
- `RunTickAsync_WhenGatewayThrows_PropagatesAndDoesNotEmit` — permanent failure surfaces to the loop, no
  fan-out.
- `ExecuteAsync_SweepsOnTimerAndSurvivesAFailingSweepThenStopsCleanly` — timer invokes the sweep; a
  throwing sweep does not crash the host; `StopAsync` exits cleanly (spec §5/§7).
- `ExecuteAsync_WhenCancelledBeforeFirstSweep_ExitsWithoutRunningTheTick` — clean shutdown before the
  first period; no sweep, no fan-out.

Not unit-tested (justified): `AnnouncementTickGateway` (thin EF `FromSqlRaw` wrapper — proc behaviour is
covered by the slice-1 tSQLt suite; `AppDbContext` is not unit-mockable, which is why the proc call sits
behind `IAnnouncementTickGateway`); `AnnouncementSchedulerOptions` (POCO, no branching).

Full API suite after all changes: **685 passed / 0 failed**.
