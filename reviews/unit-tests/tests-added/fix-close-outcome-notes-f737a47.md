# fix-close-outcome-notes-f737a47 — tests added / extended

## Iteration 1

Web: CloseRecordInline (no-Duplicate-field, notes-required-unless-Live, note-sent), RecordDetailPage (Status-tab Stage move; no Status category), StatusSummaryRow (no category), Stepper (reverted to read-only tests). API: ClosureServiceTests (notes-required-unless-Live, Live-optional). Deleted StatusHistoryTrail + its test.
Result: API 746/746, web 1500/1500 (coverage thresholds held).
