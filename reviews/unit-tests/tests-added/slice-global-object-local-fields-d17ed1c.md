# Unit tests added / extended — slice-global-object-local-fields-d17ed1c

## Iteration 1

Tests were authored in-slice by `/dev-build-application` (per plan). Phase 0 ran them; no gap-fill was required.

### Database (tSQLt) — new file
`database/tests/fields/test_usp_UpsertFieldDefinition_GlobalLocalCollision.sql` — class `FieldsGlobalLocalCollisionTests`, 4 cases:
1. workspace-local field colliding with a platform Global field key → `THROW 50011`.
2. platform Global field colliding with a workspace-local key → `THROW 50011`.
3. different local key coexists and re-saves without tripping the guard (proves the guard runs after `@FieldDefinitionId` resolution).
4. workspace-authored Global field on the Request built-in still upserts (guard is a no-op on built-ins — the "Platform-location" regression).

Execution: **CI-only** in this environment. Confirmed authored; red/green runs in CI on deploy.

### Web (jest) — extended existing files
- `web/src/features/fields/components/FieldObjectAndLocationFields.test.tsx` (+2): selecting a custom object forces `LocalWorkspace`; a custom-object form disables the Location select.
- `web/src/features/fields/components/FieldsCatalogTab.test.tsx` (+1, with jest-axe): a Global custom object is offered as a New-field target.

Run: `jest` on both files → **14 passed / 14**.

### API (xUnit) — none added (deliberate)
No net-new xUnit for the `SqlException 50011 → Conflict` catch. `SqlException` has no public constructor, so the branch is not exercisable with a fake `DbContext`. Coverage: the tSQLt proc-throw (above) + the existing controller `Conflict → 409` tests (`PlatformSchemaControllerTests`, `FieldsControllerTests`) + the authenticated LocalDB round-trip at CI. Run: `dotnet test --filter "FullyQualifiedName~Field|FullyQualifiedName~PlatformSchema"` → **177 passed / 177**.
