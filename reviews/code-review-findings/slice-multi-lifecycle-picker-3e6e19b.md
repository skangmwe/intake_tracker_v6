# Code-review findings — slice-multi-lifecycle-picker-3e6e19b

## Iteration 1

Scope: shared types (`gates.ts`, `requests.ts`), API (`Modules/Lifecycle`, `Modules/Requests`), web
(`features/lifecycle`, `features/requests/IntakeFormPage`), tests, e2e. Checklists: `api-middletier.md`,
`web-frontend.md`.

Two **mechanical** findings — both auto-applied:

| # | Severity | Fix class | File | Issue | Fix |
|---|---|---|---|---|---|
| 1 | Low | Mechanical | `web/src/features/lifecycle/components/LifecyclesBar.tsx` | New `<select>` used `data-ds="input"`; every sibling `<select>` (StagesEditor/GatesEditor/shared Select) uses `data-ds="select"`. Inconsistent design-system tag. | Changed to `data-ds="select"`. |
| 2 | Low | Mechanical | `web/src/features/requests/components/IntakeFormPage.tsx` | Inline array literal passed as a JSX prop (`options={lifecycles.map(...)}`); React Compiler is not enabled, and `web-component-architecture.md` forbids inline literals as props (the original extracted `requestTypeOptions` to a const). | Extracted `lifecycleOptions` to a render-body const. |

Both fixes touched source → affected suites re-run: `LifecyclesBar` + `IntakeFormPage` (24 tests) green.

**Architectural findings:** none. Design-token conformance gate: **PASS** (349 files, 0 violations).
No new dependency, no locked-signature break (all shared-type additions are additive/optional).
