# slice-toolkit-object-bd56143 — code-review findings

Scope: the Toolkit slice diff (DB migration 065 + 6 procs + tSQLt; `api/Api/Modules/Toolkit/*` + DI +
DbContext; `shared/types/toolkit.ts`; `web/src/features/toolkit/*` + shared `SideSheet`; tests).
Checklists: database-backend, api-middletier, web-frontend. Design-conformance hook: **PASS** (376 files,
0 raw-colour / off-spec-radius violations).

## Iteration 1

- **Verified green:** API + Api.Tests build 0/0; Toolkit controller suite 29/29; web `tsc` clean on all
  toolkit + SideSheet files (remaining project `tsc` errors are pre-existing on `dev` — announcements
  `constants.ts` missing `Scheduled`/`Archived`, relationships `JSX` namespace + `FieldObjectType` —
  untouched by slice 29); web jest 9 toolkit/SideSheet suites, 42 tests pass; design-conformance PASS.
- **Patterns mirrored:** Toolkit API follows the established Features/Attachments shape (thin controller,
  proc-delegated service, `SqlParameter`-only, keyless projection rows, 403-not-404, event-spine emit).
  Web reuses shared `TableShell`/`FilterFunnel`/`TableFooter`/`EdgeStates`/`Button` + the new `SideSheet`.
- **Mechanical fixes auto-applied (Phase 1):** (1) `ToolkitService.FlipRetiredAsync` interpolated the proc
  name into `ExecuteSqlRawAsync` (EF1002 + api-data-access.md) → split into two constant-SQL methods
  (`RetireAsync`/`RestoreAsync`) + a shared `AfterFlipAsync`. (2) `ToolkitEditorSheet` built its request
  with `undefined`-valued optional keys → rebuilt to only assign defined optionals (exactOptionalPropertyTypes).
  (3) `api.test.ts` destructured possibly-undefined `mock.calls[0]` → optional-chained indexing. (4)
  `ToolkitGallery` put `role="listitem"` on a `<button>` (aria-allowed-role, jest-axe) → restructured to
  `<ul>/<li>/<button>`. All re-verified: tsc clean + 42 jest tests green.

### Low (Deferred — component length)
- `ToolkitEditorSheet.tsx` (~230 lines) and `ToolkitSurface.tsx` (~260 lines) exceed the 200/250-line
  component guidance. Both are legitimately long: the editor is one cohesive form; the surface is a
  route/composition component orchestrating toolbar + gallery/list + two sheets. Match key
  `unit-test/…` n/a. Deferred — extract only if a second consumer or a natural seam appears.

No open blocking (High) code-review findings.
