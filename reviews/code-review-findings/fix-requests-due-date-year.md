# fix-requests-due-date-year — code review

**Scope:** one function in `web/src/features/requests/components/RequestsListPage.tsx` — `formatDue` now
routes through the shared `formatDate` (removed the local `MONTHS` array).

## Iteration 1 — 0 findings

- Removed the hand-rolled `MONTHS` word-month array; `formatDue` now builds the label via `formatDate`
  on a **local-midnight** `new Date(year, month-1, day)` (TZ-safe — never `new Date(raw)`), preserving
  the aging suffix and the em-dash guard for unparseable input.
- No new imports beyond `@/shared/utils/dateFormat`; import order preserved. No `any`, no styling change.
- Design-conformance PASS.

**Result: CLEAN.**
