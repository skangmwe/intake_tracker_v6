# Code review findings — slice-announcements-worker-tick-3c72ffa

## Iteration 1

### [1] Sweep-level abort drops fan-out for already-published rows — Medium — Mechanical — APPLIED
- **File:** api/Api/Modules/Announcements/AnnouncementSchedulerService.cs (RunTickAsync)
- **Rule:** api-middletier.md § Where Business Logic Lives / batch-failure semantics (cf. document-pipeline/api-document-upload.md "a failed item does not block the batch")
- **Issue:** The emit loop `await`ed each row's fan-out without isolation. Because `usp_TickAnnouncements`
  commits each row as Published in its own transaction and never re-returns an already-flipped row, a
  single fan-out failure would abort the sweep and permanently drop the notification for every subsequent
  published row.
- **Fix:** Per-row `try/catch` that logs the failed `{AnnouncementId}` and continues; `OperationCanceledException`
  is excepted so host shutdown still aborts the sweep. No duplication risk — flipped rows are never
  re-emitted. Summary logs downgrade to `Warning` when any fan-out failed. Covered by the new test
  `RunTickAsync_WhenOneRowFanOutFails_StillEmitsTheRemainingRows`.

No other findings. All checklist items (cancellation tokens, `ConfigureAwait(false)`, DI lifetimes via
`IServiceScopeFactory`, `IOptions<T>`, structured logging without PII, EF `FromSqlRaw` for the proc) conform.
