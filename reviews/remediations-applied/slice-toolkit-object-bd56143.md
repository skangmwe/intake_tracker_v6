# slice-toolkit-object-bd56143 — remediations applied

## Iteration 1

| Phase | File | Fix |
|---|---|---|
| 1 | api/Api/Modules/Toolkit/ToolkitService.cs | EF1002 / api-data-access.md — `FlipRetiredAsync` interpolated the proc name into `ExecuteSqlRawAsync`; split into two constant-SQL methods (`RetireAsync`/`RestoreAsync`) + shared `AfterFlipAsync`. Re-verified: API build 0/0, 29 controller tests green. |
| 1 | web/src/features/toolkit/components/ToolkitEditorSheet.tsx | exactOptionalPropertyTypes — request built with `undefined`-valued optionals; rebuilt to assign only defined optionals. tsc clean. |
| 1 | web/src/features/toolkit/api.test.ts | Strict — destructured possibly-undefined `mock.calls[0]`; switched to optional-chained indexing. tsc clean. |
| 1 | web/src/features/toolkit/components/ToolkitGallery.tsx (+ toolkit.css) | jest-axe aria-allowed-role — `role="listitem"` on a `<button>`; restructured to `<ul>/<li>/<button>`. 42 jest tests green. |
