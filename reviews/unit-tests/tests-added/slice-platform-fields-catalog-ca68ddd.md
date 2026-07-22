# Unit tests added / extended — slice-platform-fields-catalog-ca68ddd

## Iteration 1

**DB (tSQLt)** — `database/tests/platform/test_usp_GetPlatformFieldCatalog.sql` (new):
- `test_ReturnsGlobalAcrossWorkspacesExcludesLocalPlatformDeleted` — Global fields from multiple
  workspaces returned (`IsLocal=0`); Local, platform-defined, and soft-deleted excluded.
- `test_NoGlobalFieldsReturnsEmpty` — empty when no Global user fields exist.

**API (xUnit)**:
- `FieldCatalogBuilderTests` — 5 new `BuildPlatformCatalogRows` cases: system synthesis for the two
  Global objects only; platform-defined non-system on Request (System-category suppressed; editable
  vs immutable; Select→SingleSelect); Global fields read-only User rows; dedup of a Global colliding
  with a platform key; a Global key colliding with a system auto-field is folded.
- `PlatformFieldsControllerTests` — `Build` helper updated for the new `IFieldSchemaService`
  dependency; added `GetPlatformFieldCatalog_Admin_ReturnsOk` and `_NotAdmin_Returns403`.

**Web (jest + jest-axe)**:
- `PlatformFieldsPage.test.tsx` — rewritten for the catalog UI: no-access, admin-renders-table,
  empty, loading, catalog-error, read-only-sheet open, platform edit → update endpoint, update
  failure announced. axe on the no-access / table / read-only-sheet states.
- `PlatformFieldEditorSheet.test.tsx` (new) — seeds name/key, saves rename (null options), Select
  options edit+submit, Escape closes, save-error announced, disabled-while-saving, empty-name guard,
  axe (default + error).
- `FieldCatalogTable.test.tsx` — Platform source pill; `caption` used as the table name.
- `FieldReadOnlySheet.test.tsx` — reworded Global message; new Platform lock-message case + axe.
- `useFields.test.tsx` — `usePlatformFieldCatalog` enabled/disabled.
- `api.test.ts` — `fetchPlatformFieldCatalog` path + abort signal.
- Deleted `PlatformFieldRow.test.tsx` (component removed as orphaned).
