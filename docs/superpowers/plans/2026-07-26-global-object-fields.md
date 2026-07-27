# Custom Fields on Global Objects (SP3b Slice 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let platform admins define full-parity fields (type, Select options, required, conditional rules) on a Global (platform-owned) custom object; the fields render read-only in every workspace and their record values store/display/filter/sort everywhere.

**Architecture:** A platform Global field is a `dbo.FieldDefinition` row with `WorkspaceId = NULL`, `Location = 'Global'`, `ObjectType = <the Global object's ObjectKey slug>` — mirroring how Slice 1 made `ObjectDefinition.WorkspaceId` nullable for Global objects. The field procs relax to a nullable-workspace Global namespace (exactly the `((@Ws IS NULL AND Location='Global') OR WorkspaceId=@Ws)` pattern proven in `usp_UpsertObjectDefinition`); a dedicated platform service path reuses the existing field helpers but skips the workspace edit-protection guards; the record query proc's field whitelist widens to include Global fields. Read surfacing (`usp_GetWorkspaceFields`/Options/Rules) already unions `Location='Global'` and computes `IsLocal=0` for NULL-workspace rows — no change.

**Tech Stack:** Azure SQL + tSQLt; ASP.NET Core + EF Core (procs via `FromSqlRaw`/`ExecuteSqlRaw`); React 19 + TypeScript (Jest + jest-axe).

**Spec:** `docs/superpowers/specs/2026-07-26-global-object-fields-design.md` (approved).

## Global Constraints

- **Migration number:** the plan assumes **101**. At build start run `git ls-tree --name-only origin/dev database/migrations/ | tail` on freshly-fetched `origin/dev` and use the next free number; renumber the file + `MigrationId` literal + rollback if it collides (it has collided on nearly every ship this program; dev tops at 100 now).
- **`dbo.CustomRecords` is NOT changed** — records stay per-workspace.
- **Additive / behavior-preserving for local + built-in fields:** every existing `usp_*FieldDefinition*` and read path keeps working unchanged for `WorkspaceId IS NOT NULL` rows; the Global (NULL-workspace) branch is purely additive. Workspace-authored Global fields on built-in objects (Request/Task) are unchanged.
- **Isolation invariant (do NOT break):** the *workspace* `FieldsController.CreateField/UpdateField` keeps returning 400 for `Custom + Location='Global'`. So on a Global object's slug the only `Location='Global'` rows are platform-owned (`WorkspaceId NULL`); a workspace's fields on it stay `LocalWorkspace`/workspace-scoped. Do not add a workspace path that writes a Global field on a custom object.
- Every async method threads `CancellationToken`. Field values Confidential — never logged. All errors ProblemDetails. tSQLt: FakeTable/AAA, never inline `@Actual=(SELECT…)`; tSQLt is CI-only (author correctly; verify via LocalDB smoke where possible — apply the proc, run an ad-hoc leak/whitelist scenario in a rolled-back transaction).
- **Test projects:** `api/Api.Tests` (flat, `McDermott.AiTracker.Api.Tests`); tSQLt under `database/tests/`; web tests colocated. `npm run type-check` (fields/objects scope) is the mid-slice web gate; the repo has ~20 PRE-EXISTING tsc errors on dev in `relationships/`, `ask/`, `audit/`, `Sidebar.test` — those are not this slice's, keep the fields scope clean. The worktree needs `web/node_modules`: junction it to the primary install (`New-Item -ItemType Junction`), and **remove the junction reparse-point (`(Get-Item $j -Force).Delete()`) before any worktree cleanup** or it wipes the primary's install.
- **Commits:** bare `git commit` is hook-blocked — use `git -C <worktree> commit`. Build with per-task commits; ship via manual `--no-ff` merge.

---

## File Structure

**DB (Tasks 1–2):**
- New migration `database/migrations/<NNN>_AlterFieldDefinition_NullableWorkspaceForGlobal.sql` (+ `_Rollback.sql`).
- Modify: `database/procedures/fields/usp_UpsertFieldDefinition.sql`, `usp_RetireFieldDefinition.sql`; `database/procedures/customrecords/usp_QueryCustomRecords.sql`.
- Modify entity: `FieldDefinitionRow.WorkspaceId` → `Guid?` (grep for `class FieldDefinitionRow`).
- tSQLt in `database/tests/fields/` + `database/tests/customrecords/`.

**API (Tasks 3–5):**
- Modify: `api/Api/Modules/Fields/FieldSchemaService.cs` (+ `.Reads.cs`, `.Catalog.cs`), `api/Api/Modules/Objects/` (a slug→Global-object resolve if not present), `api/Api/Modules/PlatformAdmin/PlatformSchemaController.cs`.
- Test: `api/Api.Tests/`.

**Web (Task 6):**
- Modify: `web/src/features/fields/platformSchema.ts`, `usePlatformSchema.ts`, `components/PlatformFieldsCatalogTab.tsx` (or the platform Fields page); reuse `components/FieldEditorSheet.tsx`. Colocated tests.

**Records verify (Task 7):** no new files expected; a test if a gap appears.

---

### Task 1: Schema — nullable FieldDefinition.WorkspaceId + index re-scope + entity

**Files:**
- Create: `database/migrations/<NNN>_AlterFieldDefinition_NullableWorkspaceForGlobal.sql` + `_Rollback.sql`
- Modify: the `FieldDefinitionRow` entity (grep `class FieldDefinitionRow` — likely `api/Api/Modules/Fields/FieldDtos.cs` or `api/Api/Data/`), `FieldSchemaService.Reads.cs:62`

**Interfaces:**
- Produces: `dbo.FieldDefinition.WorkspaceId` nullable; `UX_FieldDefinition_Workspace_Object_Key` re-scoped `WHERE WorkspaceId IS NOT NULL AND IsDeleted = 0`. `FieldDefinitionRow.WorkspaceId` → `Guid?`. `FieldDefinitionDto.WorkspaceId` stays `Guid` (mapped `?? Guid.Empty`).

- [ ] **Step 1: Write the migration.** Model exactly on `database/migrations/20260726_100_AlterObjectDefinition_NullableWorkspaceForGlobal.sql` (open it). Header comment per `database-migrations.md`. Body:

```sql
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Drop the per-workspace unique index before the metadata-only NOT NULL→NULL widening, then recreate
-- it re-scoped so NULL-workspace (platform-owned Global) rows don't participate in per-workspace uniqueness.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX UX_FieldDefinition_Workspace_Object_Key ON dbo.FieldDefinition;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.FieldDefinition')
           AND name = N'WorkspaceId' AND is_nullable = 0)
    ALTER TABLE dbo.FieldDefinition ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_FieldDefinition_Workspace_Object_Key
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey)
        WHERE WorkspaceId IS NOT NULL AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'<NNN>_AlterFieldDefinition_NullableWorkspaceForGlobal')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'<NNN>_AlterFieldDefinition_NullableWorkspaceForGlobal', SUSER_SNAME(), N'SP3b slice 2a — nullable WorkspaceId so a Global object''s fields are platform-owned (WorkspaceId NULL, Location=Global).');
GO
```

Confirm the ORIGINAL definition of `UX_FieldDefinition_Workspace_Object_Key` by opening migrations 014 + 078 (it is recreated in 078 lines ~46-48 as `(WorkspaceId, ObjectType, FieldKey) WHERE IsDeleted = 0`) so the recreate above and the rollback below match exactly except for the added `WorkspaceId IS NOT NULL`. The `UX_FieldDefinition_Global_Object_Key` index (`WHERE Location='Global'`) is NOT touched.

- [ ] **Step 2: Write the rollback.** `_Rollback.sql`: guard first (`IF EXISTS (SELECT 1 FROM dbo.FieldDefinition WHERE WorkspaceId IS NULL) THROW 51000, 'Cannot restore NOT NULL: platform-owned Global fields (WorkspaceId NULL) exist. Delete them first.', 1;`), then drop the re-scoped index, `ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NOT NULL`, recreate the index at its ORIGINAL definition (`WHERE IsDeleted = 0`, no `WorkspaceId IS NOT NULL`), delete the history row. Idempotent guards throughout. Model on `..._100_..._Rollback.sql`.

- [ ] **Step 3: Entity change.** Change `FieldDefinitionRow.WorkspaceId` from `Guid` to `Guid?` (grep `class FieldDefinitionRow`). In `FieldSchemaService.Reads.cs:62`, change `row.WorkspaceId` to `row.WorkspaceId ?? Guid.Empty` in the `FieldDefinitionDto(...)` construction so the DTO's `WorkspaceId` (typed `Guid`) surfaces a platform-owned field as `Guid.Empty`. Confirm `dotnet build api/Api` compiles.

- [ ] **Step 4: Build + smoke + commit.** `dotnet build api/Api`. If LocalDB is available, apply the migration and confirm `WorkspaceId` is nullable and the re-scoped index exists. Note in the report.

```bash
git -C <worktree> add database/migrations api/Api
git -C <worktree> commit -m "feat(sp3b): nullable FieldDefinition.WorkspaceId for platform-owned Global fields"
```

---

### Task 2: Field procs accept NULL workspace + record query whitelist widen

**Files:**
- Modify: `database/procedures/fields/usp_UpsertFieldDefinition.sql`, `usp_RetireFieldDefinition.sql`, `database/procedures/customrecords/usp_QueryCustomRecords.sql`
- Test: `database/tests/fields/` + `database/tests/customrecords/` tSQLt

**Interfaces:**
- Consumes: nullable `WorkspaceId` (Task 1).
- Produces: field upsert/retire that create/edit/retire a Global (NULL-workspace) field; a record query whitelist that includes Global fields.

- [ ] **Step 1: Relax `usp_UpsertFieldDefinition` for `@WorkspaceId = NULL`.** Open the proc. It assumes a non-null `@Ws`. Every place it scopes name/key uniqueness or the update-path existence check with `WHERE … WorkspaceId = @Ws …`, change the predicate to the Global-namespace form (mirror `usp_UpsertObjectDefinition`'s 3 predicates):
```sql
      ((@Ws IS NULL AND Location = N'Global') OR WorkspaceId = @Ws)
```
The INSERT/UPDATE already write `@WorkspaceId` and `@Location` from params — storing NULL + `'Global'` is correct once the column is nullable. Do NOT change any `@Ws`-scoped behavior for a real workspace. If the proc references `@WorkspaceId` inside the unique-key existence check for the slug/key, the re-scoped index (Task 1) + this predicate keep it correct. Note in the report every predicate you changed.

- [ ] **Step 2: Relax `usp_RetireFieldDefinition` for `@WorkspaceId = NULL`.** Open it. Relax its existence/scope predicate the same way (`((@Ws IS NULL AND Location='Global') OR WorkspaceId=@Ws)`) so a platform retire (called with `@WorkspaceId = NULL`) can soft-retire a Global field. If it keys only on `(ObjectType, FieldKey)` without a workspace filter, note that (no change needed) in the report.

- [ ] **Step 3: Widen the `usp_QueryCustomRecords` field whitelist to include Global fields.** Open `database/procedures/customrecords/usp_QueryCustomRecords.sql`. Find the `@Fields` whitelist load (~lines 141-145):
```sql
    INSERT INTO @Fields (FieldKey, FieldType)
        SELECT FieldKey, FieldType
        FROM   dbo.FieldDefinition
        WHERE  WorkspaceId = @Ws AND ObjectType = @Slug AND IsDeleted = 0 AND IsRetired = 0;
```
Change the WHERE to:
```sql
        WHERE  (WorkspaceId = @Ws OR Location = N'Global')
          AND  ObjectType = @Slug AND IsDeleted = 0 AND IsRetired = 0;
```
This surfaces both the workspace's own local fields AND the Global (platform) fields for filter/sort. **Do not change anything else in the proc** — the dynamic predicate/sort still only reference keys drawn from `@Fields` via `sp_executesql` params (no new injection surface). Scoped by `ObjectType = @Slug`, so no cross-object bleed; a different workspace's local field (not `@Ws`, not Global) is still excluded. Update the header comment to note Global fields are included.

- [ ] **Step 4: tSQLt tests.** Find the existing field/record test classes (`grep -rln "usp_UpsertFieldDefinition\|usp_QueryCustomRecords" database/tests`). Add (FakeTable `dbo.FieldDefinition` / `dbo.SelectOption` / `dbo.FieldRuleDependency` / `dbo.CustomRecords` as needed; AAA; `DECLARE @x = (SELECT…)` + `AssertEquals`):
  - `usp_UpsertFieldDefinition @WorkspaceId = NULL, @Location = N'Global'` creates a NULL-workspace Global field (assert the row: `WorkspaceId IS NULL AND Location='Global' AND ObjectType=<slug>`).
  - `usp_UpsertFieldDefinition` name/key uniqueness holds within the Global namespace (a second create of the same `(ObjectType, FieldKey)` Global field is a duplicate — the `UX_FieldDefinition_Global_Object_Key` index throws; assert via `tSQLt.ExpectException` or the proc's own guard).
  - `usp_GetWorkspaceFields @WorkspaceId = <someWs>` returns a platform Global field on the slug with `IsLocal = 0` (foreign/read-only) from a non-owning workspace.
  - **Leak-exclusion:** `usp_QueryCustomRecords` for `@Ws = <A>` whitelists a platform Global field on the slug (filterable) AND workspace A's own local field, but a DIFFERENT workspace B's local field on the same slug is excluded from A's whitelist. Model the assertion on the object leak-exclusion test in `test_ObjectDefinition.sql` (`test_WorkspaceOwnedRowMislabelledGlobal_DoesNotLeakCrossTenant`). (Assert on the query result set / the effective filterable set — e.g. filter by B's field key returns no narrowing for A, or assert the record set is unaffected by B's field.)
  - `usp_RetireFieldDefinition @WorkspaceId = NULL` retires a Global field (assert `IsRetired = 1`).

- [ ] **Step 5: Build + smoke + commit.** `dotnet build api/Api` (confirms nothing else broke). If LocalDB available, apply the 3 procs and run a rolled-back smoke: insert a NULL-workspace Global field on a slug + a workspace-B local field on the same slug, then run `usp_QueryCustomRecords` for workspace A and confirm the Global field is in the whitelist and B's field is not. Note results.

```bash
git -C <worktree> add database/procedures database/tests
git -C <worktree> commit -m "feat(sp3b): field procs accept NULL-workspace Global fields; record query whitelist includes Global fields"
```

---

### Task 3: `ExecuteUpsertAsync` nullable + platform Global-field service path

**Files:**
- Modify: `api/Api/Modules/Fields/FieldSchemaService.cs`, `api/Api/Modules/Fields/FieldSchemaService.Reads.cs`
- Test: `api/Api.Tests/` (find the existing FieldSchemaService test file via grep)

**Interfaces:**
- Consumes: relaxed procs (Task 2); the private helpers `ReadFieldsAsync(Guid workspaceId, string objectType, ct)`, `ReadDependenciesAsync`, `ComputeDependencies`, `ValidateFieldTypeShape`, `ValidateGraphWithChange`, `ExecuteUpsertAsync`.
- Produces on `IFieldSchemaService`:
  - `Task<FieldOperationResult> UpsertGlobalObjectFieldAsync(string objectKey, FieldDefinitionUpsertRequest request, bool isCreate, Guid actorUserId, CancellationToken cancellationToken)`
  - `Task<FieldOperationResult> RetireGlobalObjectFieldAsync(string objectKey, string fieldKey, Guid actorUserId, CancellationToken cancellationToken)`

- [ ] **Step 1: Make `ExecuteUpsertAsync` nullable-workspace.** In `FieldSchemaService.Reads.cs:120`, change the signature `Guid workspaceId` → `Guid? workspaceId`, and the `@WorkspaceId` SqlParameter (line 149) from `new SqlParameter("@WorkspaceId", workspaceId)` to `new SqlParameter("@WorkspaceId", (object?)workspaceId ?? DBNull.Value)`. The existing `UpsertFieldAsync` caller passes a real `Guid` (implicitly converts to `Guid?`) — unchanged behavior. Build.

- [ ] **Step 2: Failing tests.** In the FieldSchemaService test file, add unit tests for the pure/guard logic reachable without a DB (mirror the file's existing approach — much of the DB path is covered by tSQLt + the controller tests). At minimum: `UpsertGlobalObjectFieldAsync` on a non-existent / non-Global / built-in `objectKey` returns `NotFound` (mock `IObjectSchemaService.ListGlobalAsync` to return a fixed Global-object set); a valid Select field with no options returns `ValidationFailed` (reuses `ValidateFieldTypeShape`). If the DB-backed happy path can't be unit-tested in this file's style, note that it is covered by the platform controller tests (Task 4) + tSQLt (Task 2).

- [ ] **Step 3: Implement `UpsertGlobalObjectFieldAsync`.** Add to `FieldSchemaService.cs`. It mirrors `UpsertFieldAsync` but with platform semantics — reuse the private helpers, and **skip the `IsLocal`/`ForeignGlobal` and `IsPlatformDefined` guards** (a platform admin owns Global fields; a Global field always reads back `IsLocal=0`), and emit **no** event (platform ops are firm-wide, not per-workspace — mirrors Slice 1's platform object CRUD which emits none):

```csharp
public async Task<FieldOperationResult> UpsertGlobalObjectFieldAsync(
    string objectKey, FieldDefinitionUpsertRequest request, bool isCreate, Guid actorUserId, CancellationToken cancellationToken)
{
    // The target must be a Global custom object (WorkspaceId NULL, Location='Global', not a built-in).
    var globals = await _objects.ListGlobalAsync(cancellationToken).ConfigureAwait(false);
    if (!globals.Any(o => o is { IsSystem: false, Location: "Global" } && o.ObjectKey == objectKey))
    {
        return new FieldOperationResult(FieldOperationOutcome.NotFound);
    }

    request.ObjectType = objectKey;
    request.Location = "Global";          // forced — platform fields are always Global
    var fieldKey = request.FieldKey!;

    // Read the object's Global fields (Guid.Empty owns no rows, so only Location='Global' rows surface).
    var existing = await ReadFieldsAsync(Guid.Empty, objectKey, cancellationToken).ConfigureAwait(false);
    var current = existing.FirstOrDefault(field => field.FieldKey == fieldKey);
    if (isCreate && current is not null) return new FieldOperationResult(FieldOperationOutcome.Conflict);
    if (!isCreate && current is null) return new FieldOperationResult(FieldOperationOutcome.NotFound);
    // NOTE: no IsLocal/ForeignGlobal/IsPlatformDefined guard — platform admins own Global fields.

    var validationErrors = ValidateFieldTypeShape(request);
    var dependencies = ComputeDependencies(request);
    var graph = ValidateGraphWithChange(
        await ReadDependenciesAsync(Guid.Empty, objectKey, cancellationToken).ConfigureAwait(false), fieldKey, dependencies);
    if (!graph.IsValid) validationErrors = validationErrors.Concat(graph.Errors).ToList();
    if (validationErrors.Count > 0)
        return new FieldOperationResult(FieldOperationOutcome.ValidationFailed, Errors: validationErrors);

    await ExecuteUpsertAsync(null, request, dependencies, actorUserId, cancellationToken).ConfigureAwait(false);

    var refreshed = await ReadFieldsAsync(Guid.Empty, objectKey, cancellationToken).ConfigureAwait(false);
    var saved = refreshed.First(field => field.FieldKey == fieldKey);
    return new FieldOperationResult(FieldOperationOutcome.Success, saved);
}
```

Inject `IObjectSchemaService _objects` into `FieldSchemaService` if not already present (add to the ctor + field; grep the ctor at `FieldSchemaService.cs:81`). **Verify this does NOT create a DI cycle** — `ObjectSchemaService` depends only on `AppDbContext` (checked in Slice 1), not on `IFieldSchemaService`, so `FieldSchemaService → IObjectSchemaService` is acyclic. Add a container-resolution assertion if unsure (the SP5 lesson — a real provider-scope resolve of `IFieldSchemaService`).

- [ ] **Step 4: Implement `RetireGlobalObjectFieldAsync`.** Mirror `RetireFieldAsync` but: validate the Global-object target (as above), read via `ReadFieldsAsync(Guid.Empty, objectKey)`, skip the `IsLocal`/`IsPlatformDefined` guards, keep the dependency guard (`stillReferenced`), then `EXEC dbo.usp_RetireFieldDefinition @WorkspaceId=<DBNull>, @ObjectType=objectKey, @FieldKey=fieldKey, @ActorUserId=…` (pass `DBNull.Value` for `@WorkspaceId`), no event. Return `Success` with `current with { IsRetired = true }`.

- [ ] **Step 5: Add to `IFieldSchemaService`.** Add the two method signatures (Interfaces block above). Build + `dotnet test api/Api.Tests` (the new unit tests) — green.

```bash
git -C <worktree> add api/Api/Modules/Fields api/Api.Tests
git -C <worktree> commit -m "feat(sp3b): FieldSchemaService platform Global-object field upsert/retire path"
```

---

### Task 4: Platform Global-object field CRUD endpoints

**Files:**
- Modify: `api/Api/Modules/PlatformAdmin/PlatformSchemaController.cs`
- Test: `api/Api.Tests/PlatformSchemaControllerTests.cs`

**Interfaces:**
- Consumes: `IFieldSchemaService.UpsertGlobalObjectFieldAsync` / `RetireGlobalObjectFieldAsync` (Task 3); `IAccessGuard.IsPlatformAdminAsync`; `FieldDefinitionUpsertRequest`, `FieldOperationResult`/`FieldOperationOutcome`.

- [ ] **Step 1: Failing tests.** Add to `PlatformSchemaControllerTests.cs` (mirror the Slice-1 object CRUD tests in the same file — `Build(isPlatformAdmin, objects, …)` harness): non-platform-admin → 403 on POST/PATCH/DELETE fields; platform-admin create → 200 with the field; create with a bad shape (Select, no options) → 400; duplicate field key → 409; patch/delete on a non-Global-object → 404; delete → 204. Mock `IFieldSchemaService` (add it to the controller's ctor + the test harness `Build`).

- [ ] **Step 2: Implement the endpoints** in `PlatformSchemaController` (route `api/v1/platform`), nested under the Global object, mirroring the object CRUD shape + the `AccessDenied()`/`MapMutation`/`NameRequired`/`ConflictProblem` helpers already there:
  - `[HttpPost("objects/{objectKey}/fields")] CreateField(objectKey, [FromBody] FieldDefinitionUpsertRequest request, ct)` → `_fields.UpsertGlobalObjectFieldAsync(objectKey, request, isCreate: true, _currentUser.UserId, ct)`.
  - `[HttpPatch("objects/{objectKey}/fields/{fieldKey}")] UpdateField(objectKey, fieldKey, [FromBody] FieldDefinitionUpsertRequest request, ct)` → set `request.FieldKey = fieldKey`, `UpsertGlobalObjectFieldAsync(objectKey, request, isCreate: false, …)`.
  - `[HttpDelete("objects/{objectKey}/fields/{fieldKey}")] DeleteField(objectKey, fieldKey, ct)` → `RetireGlobalObjectFieldAsync(objectKey, fieldKey, _currentUser.UserId, ct)` → 204 / 404.
  - All gated by `IsPlatformAdminAsync` FIRST (403 for non-admins). Map `FieldOperationOutcome`: `Success` → 200 `Ok(result.Field)` (create/patch) or 204 (delete); `NotFound` → 404; `Conflict` → 409; `ValidationFailed` → 400 `ValidationProblem` with `result.Errors`; `ForeignGlobal`/`PlatformDefined` should not occur on this path (map to 409/500 defensively). Inject `IFieldSchemaService` into the controller ctor (update the DI + the test harness).

- [ ] **Step 3: Build + test + commit.** `dotnet build api/Api` then `dotnet test api/Api.Tests` — green.

```bash
git -C <worktree> add api/Api/Modules/PlatformAdmin api/Api.Tests
git -C <worktree> commit -m "feat(sp3b): platform-admin Global-object field CRUD endpoints"
```

---

### Task 5: Platform Fields catalog surfaces Global-object fields as editable

**Files:**
- Modify: `api/Api/Modules/Fields/FieldSchemaService.Catalog.cs`
- Test: `api/Api.Tests/` (the FieldCatalogBuilder tests — grep `BuildPlatformCatalogRows`)

**Interfaces:**
- Consumes: `usp_ListGlobalObjectDefinitions` (Slice 1) via `IObjectSchemaService.ListGlobalAsync`; the Global fields on each Global object via the read path.

- [ ] **Step 1: Failing test.** In the platform-catalog builder test, add: a Global custom object with one Global field surfaces on the platform catalog as an **editable** row (not read-only), grouped under that object; its five synthetic system auto-fields surface read-only. Model on the existing `BuildPlatformCatalogRows` tests.

- [ ] **Step 2: Implement.** In `GetPlatformCatalogAsync` / `BuildPlatformCatalogRows` (`FieldSchemaService.Catalog.cs`), extend the composition so each Global **custom** object (from `ListGlobalAsync`, `IsSystem == false`) contributes: its five synthetic system auto-fields (read-only, as built-in Global objects already do), plus its platform-owned Global fields read via the field read path (`ReadFieldsAsync(Guid.Empty, objectKey)` filtered to the Global rows) as **editable** rows (`IsReadOnly = false`, an appropriate `Source`). Keep the existing three bands (system auto-fields on built-in Global objects, `dbo.PlatformField`, Global fields across workspaces) unchanged. Follow the existing row-shape and label conventions (`LabelForObject`).

- [ ] **Step 3: Build + test + commit.** `dotnet build api/Api` then `dotnet test api/Api.Tests` — green.

```bash
git -C <worktree> add api/Api/Modules/Fields api/Api.Tests
git -C <worktree> commit -m "feat(sp3b): platform Fields catalog lists Global-object fields editable"
```

---

### Task 6: Platform Fields tab — author fields on a Global object

**Files:**
- Modify: `web/src/features/fields/platformSchema.ts`, `usePlatformSchema.ts`, the platform Fields tab component (grep `PlatformFieldsCatalogTab` / the platform Fields page); reuse `web/src/features/fields/components/FieldEditorSheet.tsx`
- Test: colocated `.test.tsx` / `.test.ts`

**Interfaces:**
- Consumes: `POST/PATCH/DELETE /api/v1/platform/objects/{objectKey}/fields[/{fieldKey}]` (Task 4). `FieldDefinitionDto` (`location`, `isLocal`, `workspaceId`, `objectType`, options, rules).

- [ ] **Step 1: Read the precedents, write failing tests.** Read `PlatformObjectsTab.tsx` + `PlatformObjectEditorSheet.tsx` (Slice 1 — the platform create/edit/delete + inline-confirm precedent), the platform Fields catalog tab, and `FieldEditorSheet.tsx` (the full-parity field editor to reuse). Write tests: a "New field" action on a Global custom object opens the field editor (Object fixed to the Global object, Location fixed to Platform/Global — no Location control); saving posts to the platform field endpoint; editing a Global-object field patches; deleting confirms inline (`role=alertdialog`, per Slice 1) then deletes; the object's system auto-fields + other bands stay read-only. jest-axe on the editor open state + the confirm state.

- [ ] **Step 2: Implement api + hooks.** `platformSchema.ts`: add `createPlatformObjectField(objectKey, request)`, `updatePlatformObjectField(objectKey, fieldKey, request)`, `deletePlatformObjectField(objectKey, fieldKey)` (POST/PATCH/DELETE, mirror the Slice-1 object wrappers). `usePlatformSchema.ts`: add `useCreate/Update/DeletePlatformObjectField` mutations invalidating the platform fields-catalog query key.

- [ ] **Step 3: Implement the tab.** In the platform Fields tab, add a "New field" affordance per Global custom object (or a top-level New field with an Object picker limited to Global custom objects); open `FieldEditorSheet` with the Object fixed and `location` fixed to Global (reuse its full-parity type/options/rules UI; hide/disable the Location control — mirror how Slice 1's `PlatformObjectEditorSheet` dropped the Location control). Edit/Delete on the object's platform-owned field rows only; delete uses the inline-confirm pattern. `data-ds` on design-system components; no raw colors/radii; follow `web-styling.md` + a11y rules.

- [ ] **Step 4: type-check + web tests + commit.** `cd web && npm run type-check` (fields scope clean) then `npx jest src/features/fields`. Commit.

```bash
git -C <worktree> add web/src/features/fields
git -C <worktree> commit -m "feat(sp3b): platform Fields tab authors fields on Global objects"
```

---

### Task 7: Workspace read-only surface + records verification

**Files:**
- Verify (modify only if a gap): the workspace Fields catalog rendering of a Global object's fields; the CSV import/export field enumeration.
- Test: colocated + a records test if a gap appears.

**Interfaces:**
- Consumes: the read path (`usp_GetWorkspaceFields` returning Global fields `IsLocal=0`), the query whitelist (Task 2), `IFieldSchemaService.GetSchemaAsync`.

- [ ] **Step 1: Verify workspace read-only surfacing.** Confirm a workspace opening a Global object's fields (the flat catalog keyed by the object's slug — the Global custom object appears in `usp_ListObjectDefinitions` post-Slice-1, so the catalog's custom-object enumeration includes it) shows the platform Global fields foreign-Global / read-only (`isReadOnly` from `!IsLocal`). If the catalog does NOT list a Global object's slug as a readable field group in a workspace, add the minimal enumeration fix (the read union already returns the fields; the gap would only be the object not appearing as a field target). Add/confirm a component test that a Global object's platform field renders read-only in the workspace catalog.

- [ ] **Step 2: Verify record values end-to-end.** Confirm (test) that a custom record on a Global object stores a Global field's value and that `usp_QueryCustomRecords` filter/sort on that Global field key now works (covered by Task 2 tSQLt; add an API/integration assertion only if the existing harness supports it — the project's integration tests are 401-gating only, so this may be tSQLt-only; note it).

- [ ] **Step 3: Verify CSV import/export.** Confirm the IO descriptor for a Global object includes its Global fields (it resolves columns via `IFieldSchemaService.GetSchemaAsync(ws, slug)`, which returns Global fields via the union). If a Global object's fields are missing from export columns or import mapping, add the fix + a test (`CustomObjectWizards.test.tsx` precedent). If already correct, note it — no change.

- [ ] **Step 4: type-check + tests + commit.** `cd web && npm run type-check` then `npx jest src/features/fields src/features/custom-records`. Commit any changes.

```bash
git -C <worktree> add web/src database
git -C <worktree> commit -m "feat(sp3b): Global-object fields render read-only in workspaces; records/IO verified"
```

---

## Self-Review

**1. Spec coverage:**
- Nullable `FieldDefinition.WorkspaceId` + index re-scope → Task 1. ✓
- Field procs accept NULL workspace (upsert/retire) + query whitelist widen → Task 2. ✓
- Platform Global-field service path (skip workspace guards, no events, reuse helpers) → Task 3. ✓
- Platform-admin field CRUD endpoints → Task 4. ✓
- Platform catalog shows Global-object fields editable → Task 5. ✓
- Platform Fields tab authoring (full parity, no Location control, inline-confirm delete) → Task 6. ✓
- Workspace read-only surfacing + records + import/export verify → Task 7. ✓
- Isolation invariant (keep workspace Custom+Global block; Global detection stays Location-based for built-ins; leak-exclusion test) → honored in Global Constraints + Task 2 Step 4 + not adding a workspace Global-write path. ✓
- Read procs (GetWorkspaceFields/Options/Rules) unchanged (verify only) → Task 2 tSQLt + Task 7. ✓

**2. Placeholder scan:** `<NNN>` migration number is a deliberate build-time verification (Global Constraints). "grep for the existing test class / read the precedent" are inherent to matching existing patterns; the exact SQL predicate transformations, the whitelist change, and the `UpsertGlobalObjectFieldAsync` body are given verbatim.

**3. Type consistency:** `FieldDefinitionRow.WorkspaceId: Guid?` (Task 1) → `?? Guid.Empty` in `ReadFieldsAsync` (Task 1) → `FieldDefinitionDto.WorkspaceId: Guid` unchanged. `ExecuteUpsertAsync(Guid? workspaceId, …)` (Task 3 Step 1) consumed by both the existing `UpsertFieldAsync` (passes `Guid`) and the new `UpsertGlobalObjectFieldAsync` (passes `null`). `UpsertGlobalObjectFieldAsync(objectKey, request, isCreate, actor, ct)` / `RetireGlobalObjectFieldAsync(objectKey, fieldKey, actor, ct)` defined in Task 3, consumed in Task 4. `FieldDefinitionUpsertRequest` (has `Location`, `ObjectType`, `FieldKey`, `Options`, `Rules`, `IsRequired`, …) reused unchanged. Web `create/update/deletePlatformObjectField` (Task 6) call the Task 4 routes.

**4. Risk / ambiguity:** The `WorkspaceId`-nullable migration + index re-scope is the highest-risk step (Task 1 — modelled on migration 100, rollback NULL-guarded). The query-whitelist change (Task 2 Step 3) is the security-sensitive one — the leak-exclusion tSQLt test (Task 2 Step 4) guards both injection boundary and tenant isolation. The `FieldSchemaService → IObjectSchemaService` injection (Task 3 Step 3) is checked for a DI cycle (acyclic — ObjectSchemaService depends only on AppDbContext). The platform service path deliberately skips the `IsLocal`/`ForeignGlobal` guards — enumerated in Task 3 Step 3 with the reasoning.
