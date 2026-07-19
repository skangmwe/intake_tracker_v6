# Unit-test failures / gaps — slice-multi-lifecycle-picker-3e6e19b

## Iteration 1

One failure surfaced by running the authored suites; **Mechanical** (test bug), auto-remediated.

| Severity | Fix class | File | Failure | Fix |
|---|---|---|---|---|
| Medium | Mechanical (test bug) | `web/src/features/lifecycle/components/LifecyclePage.test.tsx` | Two page-level tests still asserted the **old chip bar** (`getByRole('button', {name:/standard.*default/i})`; `getByDisplayValue('New lifecycle')` now matched both the name input and the dropdown's selected option; `getAllByRole('button', {name:/type ·/i})`). Slice-27 converted S31's selector to a dropdown. | Updated to the dropdown: `getByRole('combobox', {name:'Select lifecycle'})`, `getByRole('option', …)`, `getByRole('textbox', {name:'Lifecycle name'})`, and `within(selector).getAllByRole('option')`. |

After the fix: `LifecyclePage` suite green; full web jest suite **1157/1157**.

## Coverage

Web branch coverage **79.91%** (threshold 80%). Within the documented **[78%, 80%)** tolerance
(`web-testing.md`). The shortfall is defensive/unreachable branches only — `LifecyclesBar.tsx:80`
(`?? lifecycles[0]` selection fallback), `lifecycleDraft.ts:248` (unreachable exhaustive-switch
`return state`), `IntakeFormPage.tsx` empty-lifecycle-list fallback + pre-existing widget/panel lines,
and `test-utils.tsx` fixture `...overrides` spreads — **no uncovered behavior**. Per the rule, accepted
without filler tests (never add tests to move the percentage on unreachable branches).

## API

`dotnet test` (lifecycle + resolve-lifecycle unit suites) **31/31**. No failures, no gaps —
the 6 `ResolveLifecycle` precedence cases + `MapSummaries` + `GetLifecycles` (200/403) were authored
in-slice.

**tSQLt:** not run — the framework is not vendored in the repo (pre-existing; see the runbook Gotchas).
No DB procs changed in slice 27 (the list endpoint reuses `usp_GetWorkspaceLifecycles`).
