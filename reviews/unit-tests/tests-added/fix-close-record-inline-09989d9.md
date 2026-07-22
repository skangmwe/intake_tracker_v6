# fix-close-record-inline-09989d9 — tests added / extended

## Iteration 1

- **Added** `web/src/features/closure/CloseRecordInline.test.tsx` — render (no dialog,
  lead + Close record button), Cancel (no API call), Duplicate-requires-target branch,
  successful Live close (delivery outcome sent + onClosed called), error state. jest-axe
  on render / Duplicate / error states.
- **Updated** `web/src/features/requests/components/RecordDetailPage.test.tsx` — the
  "picking a Closed outcome" test now asserts the inline panel appears in place (no
  `dialog`), the picker reflects the picked outcome, and setStatusHold is not called.
- **Removed** `web/src/features/closure/CloseRecordModal.test.tsx` (component deleted).

Result: 27/27 pass across the two affected suites.
