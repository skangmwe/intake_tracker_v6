# Remediations applied — slice-multi-lifecycle-picker-3e6e19b

## Iteration 1

| Phase | Severity | File | Remediation |
|---|---|---|---|
| 0 | Medium | `web/src/features/lifecycle/components/LifecyclePage.test.tsx` | Test bug — updated 2 page-level assertions from the old chip bar to the dropdown (`combobox`/`option`/`textbox`). Re-run green. |
| 1 | Low | `web/src/features/lifecycle/components/LifecyclesBar.tsx` | `data-ds="input"` → `data-ds="select"` (match sibling `<select>` design-system tag). |
| 1 | Low | `web/src/features/requests/components/IntakeFormPage.tsx` | Extracted inline `options={lifecycles.map(...)}` to a `lifecycleOptions` render const (React Compiler off; no inline array literals as JSX props). |

All three touched source/tests → affected jest suites re-run after each fix (LifecyclesBar, LifecyclePage,
IntakeFormPage — 24 tests green; full suite 1157/1157). No regressions introduced.
