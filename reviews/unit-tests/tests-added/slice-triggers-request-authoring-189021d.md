# slice-triggers-request-authoring-189021d — unit tests

## Iteration 1

Tests authored during the slice (per web-testing.md + accessibility.md); Phase 0 ran them, no gap-fill or remediation required.

**Suites (9), all passing:**
- `constants.test.ts` — label lookups + unknown-value fallback.
- `triggerForm.test.ts` — buildInitialForm (create/edit round-trip, null→'' compareValue), formToRequest (drop interval when Once, null value for valueless/blank comparator, trim name/title/body), comparatorTakesValue, isTodayValue, emptyCondition.
- `errorMessage.test.ts` — ApiError→detail, other→generic fallback.
- `api.test.ts` — GET/POST/PUT/DELETE path+method+body + abort signal.
- `triggersModel.test.tsx` — query enablement; save create-vs-update branch; delete (renderHook + QueryClient wrapper).
- `TriggerConditionsEditor.test.tsx` — render, add, remove, valueless comparator hides value, Today toggle sets @today + disables input, empty state; jest-axe across value-carrying, valueless, and empty states.
- `TriggerEditorSheet.test.tsx` — create/edit chrome, cadence-interval reveal, recipient selection + submit payload, server-error alert, delete; jest-axe across create/error/edit.
- `TriggersList.test.tsx` — loading/error/empty/populated (enabled+disabled badges), open create editor, edit→delete api call; jest-axe across error/empty/populated.
- `TriggersAdminPage.test.tsx` — no-access, single-workspace (no picker), multi-workspace picker; jest-axe on no-access + single-admin.

**Coverage (project run, `npm run test:coverage`, exit 0):** All files 89.55% stmts / 80.37% branch / 83.45% func / 90.85% lines — above the 80% project floor. `src/features/triggers` 100% stmts / 95.83% branch.

**Documented sub-directory gap:** `src/features/triggers/components` branch coverage is 78.04% (within the accepted [78%, 80%) band per web-testing.md). Every required behaviour case is covered; the uncovered branches are minor defensive fallbacks with no distinct behaviour — `fieldKeys[0] ?? ''` seed fallback, `repeatIntervalDays ?? DEFAULT_REPEAT_INTERVAL_DAYS`, and optional-chaining nullish fallbacks on already-guarded data. No behaviour is untested.

**Gaps / slice-authoring findings:** none.
