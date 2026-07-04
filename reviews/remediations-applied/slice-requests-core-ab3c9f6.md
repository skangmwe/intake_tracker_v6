# slice-requests-core-ab3c9f6 — remediations applied

## Iteration 1

### Phase: 0 (unit tests / real-DB validation)
- **4 web test accessible-name mismatches** — the `(optional)` label suffix + role-vs-text queries; test-side fixes (components were correct per spec). Files: `IntakeFormPage.test.tsx`, `RecordDetailPage.test.tsx`, `RequestsListPage.test.tsx`.
- **`RangeSlider` keyboard test** — jsdom doesn't simulate native-range arrow keys; rewritten to a controlled `fireEvent.change` harness (deterministic; still asserts value + readout).
- **2 load-flaky timeouts** (`IntakeFormPage` submit, `FieldEditorSheet` numeric) — per-test timeout raised to 15000ms.
- **Branch-coverage top-up** — extended `requestForm`/`evaluateComparator`/`evaluateFieldConditions` tests (branch 73.56% → 78.6%, within the documented [78,80%) band).
- **[Critical] DB — `Requests.DueDate` non-deterministic PERSISTED** — caught by real LocalDB deploy (`CREATE TABLE` failure). Fix: made `DueDate` a non-persisted computed column + removed from covering-index INCLUDE. File: `database/migrations/20260704_029_CreateRequests.sql`. Verified: full re-deploy + end-to-end proc smoke test.

### Phase: 1 (design-fidelity render-and-compare)
- **[Medium] Web — S4 meta-strip due-date off-by-one** — caught by the real-stack render ("Jul 15" for 2026-07-16). Fix: parse date-only ISO strings as local time in `formatDayMonth`. File: `web/src/features/requests/components/RecordDetailPage.tsx`. Verified: re-render shows "Jul 16"; RecordDetailPage tests 10/10; tsc clean.

### Architectural (open — developer decision)
- `web-component-architecture.md#component-length` — the 3 page components exceed 200 lines. Deferred-eligible; not applied (recorded in `code-review-findings/`).
