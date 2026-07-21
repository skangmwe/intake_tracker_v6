# Remediations applied — slice-announcements-worker-tick-3c72ffa

## Iteration 1

- **Phase: 1** — api/Api/Modules/Announcements/AnnouncementSchedulerService.cs (RunTickAsync).
  Made the fan-out loop per-row resilient: a fan-out failure on one already-published row is logged with
  its `{AnnouncementId}` and the sweep continues with the remaining rows (batch-failure convention);
  `OperationCanceledException` still propagates so host shutdown aborts the sweep; summary log downgrades to
  `Warning` on any failure. Added test `RunTickAsync_WhenOneRowFanOutFails_StillEmitsTheRemainingRows`.
  Re-ran the API suite after the source change: 685 passed / 0 failed.
