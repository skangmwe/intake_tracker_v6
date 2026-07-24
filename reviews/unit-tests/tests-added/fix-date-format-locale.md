# fix-date-format-locale — tests added / extended

## Iteration 1

**New:** `web/src/shared/utils/dateFormat.test.ts` — locale-agnostic shape assertions for `formatDate`
(numeric mm/dd/yyyy, no word-month, year present) and `formatDateTime` (date + time + year), plus
empty-string-on-invalid for both.

**Extended (updated to compute expected via the util, so they stay locale-robust):**
- `shared/components/RecordViews/groupByDate.test.ts`, `AgendaView.test.tsx`, `TimelineView.test.tsx`
- `features/dashboards/format.test.ts`
- `shared/components/Layout/BellMenu.test.tsx`
- `features/requests/statusPresentation.test.ts` (title only — assertion already locale-agnostic)

**Run:** full suite `npm run test:coverage` → **263 suites, 1528 tests, all pass** (exit 0). Coverage
thresholds met. No new test failures; no source bugs surfaced.
