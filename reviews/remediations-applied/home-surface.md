# Remediations applied — slice/home-surface

## Iteration 1

- **Phase: 0** · `api/Api/Modules/Home/HomeController.cs` · Mechanical (source bug surfaced by a correct test).
  `Get_EmptyWorkspaceId_Returns400AndDoesNotCallService` failed: the 400 branch used
  `ControllerBase.ValidationProblem(...)`, which needs a `ProblemDetailsFactory` from request services
  (absent under unit test) and returns a derived `BadRequestObjectResult` (not the exact `ObjectResult`
  the test asserts). Replaced with a plain `ObjectResult` carrying a `ValidationProblemDetails` (Status 400,
  `application/problem+json`), mirroring the existing `AccessDenied()` helper. Re-ran `HomeControllerTests`
  → 4/4 pass; full API suite 490/490.

- **Phase: 0** · `web/src/features/home/homeView.ts` → `homeFormat.ts` (rename) · Mechanical (source bug surfaced by tests).
  All 5 `HomeView.test.tsx` tests failed with React "Element type is invalid … got: undefined". Root cause:
  the helpers file `homeView.ts` collided with the component `HomeView.tsx` on the case-insensitive
  (Windows/jest) resolver, so `import { HomeView } from './HomeView'` resolved to the lowercase helpers
  module (no `HomeView` export). This would also break the webpack build. Renamed the helpers file to
  `homeFormat.ts` and updated the four panel imports + the helper test. Re-ran the home suite → 10/10
  suites, 39/39 tests pass.
- **Phase: 0** · `web/src/features/home/homeFormat.ts` (import path) · Mechanical (code-quality, surfaced while fixing above).
  Imported `eventGroup`/`eventTypeLabel` from the `@/features/audit` **barrel**, which eagerly re-exports
  `WorkspaceAuditPage` (a full page). Switched to the leaf `@/features/audit/constants` so Home doesn't drag
  a page + its hooks into its module graph. (ActivityPanel suite green after.)
- **Phase: 0** · `web/src/features/home/components/ActivityPanel.test.tsx` (test bug) · Mechanical.
  `getByText(/Since /)` and `/your last visit/` matched both the panel `<h2>` title and the meta line
  (both contain the phrase). Narrowed to the panel heading role + an exact meta string. Suite green.
