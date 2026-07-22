# slice-platform-settings-header-09989d9 — tests added / extended

## Iteration 1

### API
- `PlatformSchemaControllerTests.cs` — rewritten to drop the workspace-picker cases (`GetWorkspaces`, `GetRelationships` missing-workspaceId 400) and cover the read-only system-seeded relationships endpoint: `GetRelationships_Admin_ReturnsOkWithSystemRelationships`, `GetRelationships_NotAdmin_Returns403`, `GetRelationships_CancellationPropagates`, plus the unchanged Objects happy/403 cases. Full API suite: **745 passed**.

### Database
- `test_usp_GetPlatformRelationships.sql` (new, ported) — tSQLt: returns distinct system relationships de-duplicated across workspaces and excludes non-system / retired / deleted rows; empty-when-none case. (tSQLt runs in the test-tenant DB; not executable in this local dev environment — proc + test ship together per the slice.)

### Frontend
- `SideNavLayout.test.tsx` — extended for the new full-width header: asserts eyebrow (nav label), active-item title, lead; title-swap on route change; title→label fallback when an item has no explicit title. jest-axe on each state.
- `PlatformLayout.test.tsx` — added a header-title assertion locking the "Field schema" nav label → "Fields & objects" header-title mapping.
- `PlatformRelationshipsTab.test.tsx` — rewritten for the read-only, no-picker table: resolved (system rows + Origin=System, no combobox/create/retire), loading, error, empty. jest-axe on each state.
- `PlatformFieldsPage.test.tsx` — Relationships-tab test updated (read-only system reference, no workspace picker); dropped the `fetchPlatformWorkspaces` mock.
- `platformSchema.test.ts` / `usePlatformSchema.test.tsx` — updated for the no-`workspaceId` relationships fetch/hook; dropped the workspaces wrapper cases.

Full web suite: **1505 passed**; coverage thresholds met.
