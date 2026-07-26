# Global Custom Objects — Foundation (SP3b Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let platform admins create firm-wide ("Global") custom objects that every workspace can use, each workspace keeping its own records. Name-only schema (custom fields = SP3b Slice 2).

**Architecture:** A Global custom object is a `dbo.ObjectDefinition` row with `WorkspaceId = NULL`, `Location = 'Global'`, `IsSystem = 0`. The object procs relax to surface/accept Global objects cross-workspace (mirroring the working Global-field pattern), records stay per-workspace (no `dbo.CustomRecords` change), and a new platform-admin Object CRUD surface creates/edits/deletes them. Import/export/upsert light up automatically because the IO descriptor resolves objects through the now-Global-aware list.

**Tech Stack:** Azure SQL + tSQLt; ASP.NET Core + EF Core (procs via `FromSqlRaw`/`ExecuteSqlRaw`); React 19 + TypeScript (Jest + jest-axe).

**Spec:** `docs/superpowers/specs/2026-07-26-global-custom-objects-foundation-design.md` (approved).

## Global Constraints

- **Migration number:** the plan assumes **100**. At build start run `ls database/migrations/ | tail` on freshly-reset `origin/dev` and use the next free number; renumber the file + `MigrationId` literal + rollback if it collides (this has collided on nearly every ship this program).
- **`dbo.CustomRecords` is NOT changed** — records stay `WorkspaceId NOT NULL`, per-workspace.
- **Additive / behavior-preserving for local objects:** every existing `usp_*ObjectDefinition*` and record proc keeps working unchanged for `WorkspaceId IS NOT NULL` local objects; the Global branch is purely additive. Nullable `WorkspaceId` must not change any local-object read/write.
- **Custom user FIELDS on Global objects are out of scope** (Slice 2). A Global object carries only Name + system auto-fields; its `FieldsCount` is 0.
- Every async method threads `CancellationToken`. Field values Confidential — never logged. All errors ProblemDetails. tSQLt: FakeTable/AAA, never inline `@Actual=(SELECT…)`; tSQLt is CI-only (author correctly; verify via LocalDB smoke where possible).
- **Test projects:** `api/Api.Tests` (flat, `McDermott.AiTracker.Api.Tests`); tSQLt under `database/tests/`; web tests colocated. `npx tsc --noEmit` is the only mid-slice web gate.
- **Commits:** bare `git commit` is hook-blocked — use `git -C <worktree> commit`. Build with per-task commits; ship via manual `--no-ff` merge.

---

## File Structure

**DB (Tasks 1–2):**
- New migration `database/migrations/<NNN>_AlterObjectDefinition_NullableWorkspaceForGlobal.sql` (+ `_Rollback.sql`).
- Modify procs in `database/procedures/objects/`: `usp_GetObjectDefinitionById.sql`, `usp_ListObjectDefinitions.sql`, `usp_GetCustomObjectCounts.sql`, `usp_UpsertObjectDefinition.sql`, `usp_DeleteObjectDefinition.sql`; new `usp_ListGlobalObjectDefinitions.sql`. Modify `database/procedures/customrecords/usp_CreateCustomRecord.sql`.
- Modify `api/Api/Data/Entities.cs` (`ObjectDefinitionRow.WorkspaceId` → `Guid?`).
- tSQLt in `database/tests/`.

**API (Tasks 3–4):**
- Modify `api/Api/Modules/Objects/ObjectSchemaService.cs`, `ObjectDtos.cs`, `PlatformAdmin/PlatformSchemaController.cs`.

**Web (Tasks 5–6):**
- Modify `web/src/features/fields/components/PlatformObjectsTab.tsx`, `usePlatformSchema.ts`, the platform objects api; and the workspace objects editor (`web/src/features/objects/components/ObjectEditorSheet.tsx` / its loader) for the read-only Global surface. Colocated tests.

---

### Task 1: Schema — nullable WorkspaceId + Global indexes + entity

**Files:**
- Create: `database/migrations/<NNN>_AlterObjectDefinition_NullableWorkspaceForGlobal.sql` + `_Rollback.sql`
- Modify: `api/Api/Data/Entities.cs`

**Interfaces:**
- Produces: `dbo.ObjectDefinition.WorkspaceId` nullable; per-workspace unique indexes re-scoped `WHERE WorkspaceId IS NOT NULL`; new `UX_ObjectDefinition_Global_ObjectKey` / `UX_ObjectDefinition_Global_Name` (`WHERE Location='Global'`). `ObjectDefinitionRow.WorkspaceId` → `Guid?`.

- [ ] **Step 1: Write the migration**

`database/migrations/<NNN>_AlterObjectDefinition_NullableWorkspaceForGlobal.sql`. The unique indexes include `WorkspaceId`, so drop them before the ALTER, then recreate re-scoped; add the Global filtered indexes. (`ALTER COLUMN` to change only nullability is metadata-only, but dropping the unique indexes is needed anyway to re-scope them.)

```sql
-- =============================================
-- Author:      global-custom-objects (SP3b slice 1)
-- Create Date: 2026-07-26
-- Description: Makes dbo.ObjectDefinition.WorkspaceId nullable so a Global (platform-owned) custom
--              object has no owning workspace (WorkspaceId=NULL, Location='Global', IsSystem=0). Re-scopes
--              the per-workspace unique indexes to WHERE WorkspaceId IS NOT NULL, and adds firm-wide
--              Global unique indexes on ObjectKey/Name (mirrors UX_FieldDefinition_Global_Object_Key).
--              Idempotent per database-migrations.md.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Workspace_Name ON dbo.ObjectDefinition;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Workspace_ObjectKey ON dbo.ObjectDefinition;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ObjectDefinition')
           AND name = N'WorkspaceId' AND is_nullable = 0)
    ALTER TABLE dbo.ObjectDefinition ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NULL;
GO

-- Per-workspace uniqueness now excludes NULL-workspace Global rows.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Workspace_Name
        ON dbo.ObjectDefinition (WorkspaceId, Name)
        WHERE WorkspaceId IS NOT NULL AND IsDeleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Workspace_ObjectKey
        ON dbo.ObjectDefinition (WorkspaceId, ObjectKey)
        WHERE WorkspaceId IS NOT NULL AND IsDeleted = 0;
GO

-- Firm-wide uniqueness for Global objects (mirrors UX_FieldDefinition_Global_Object_Key).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Global_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Global_ObjectKey
        ON dbo.ObjectDefinition (ObjectKey)
        WHERE Location = N'Global' AND IsDeleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Global_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Global_Name
        ON dbo.ObjectDefinition (Name)
        WHERE Location = N'Global' AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'<NNN>_AlterObjectDefinition_NullableWorkspaceForGlobal')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'<NNN>_AlterObjectDefinition_NullableWorkspaceForGlobal', SUSER_SNAME(), N'SP3b slice 1 — nullable WorkspaceId + Global unique indexes on ObjectDefinition.');
GO
```

Rollback: drop the two Global indexes; drop the re-scoped per-workspace indexes and recreate them at their original definition (`WHERE IsDeleted = 0`, no `WorkspaceId IS NOT NULL` clause); `ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NOT NULL` (only reversible if no NULL rows exist — guard with a check that errors if Global rows are present); delete the history row. Model the recreate on migrations 071 (`UX_ObjectDefinition_Workspace_Name`) and 077 (`UX_ObjectDefinition_Workspace_ObjectKey`) — open them to copy the exact original index definitions.

- [ ] **Step 2: Entity change**

In `api/Api/Data/Entities.cs`, change `ObjectDefinitionRow.WorkspaceId` from `Guid` to `Guid?` (grep `class ObjectDefinitionRow`). Confirm build.

- [ ] **Step 3: Build + commit**

`dotnet build api/Api`. tSQLt is CI-only; if LocalDB is available, apply the migration and confirm `WorkspaceId` is nullable + the 4 indexes exist. Note in the report.

```bash
git -C <worktree> add database/migrations api/Api/Data/Entities.cs
git -C <worktree> commit -m "feat(sp3b): nullable ObjectDefinition.WorkspaceId + Global unique indexes"
```

---

### Task 2: Object + record procs — surface/accept Global objects

**Files:**
- Modify: `usp_GetObjectDefinitionById.sql`, `usp_ListObjectDefinitions.sql`, `usp_GetCustomObjectCounts.sql`, `usp_UpsertObjectDefinition.sql`, `usp_DeleteObjectDefinition.sql` (in `database/procedures/objects/`); `usp_CreateCustomRecord.sql` (in `database/procedures/customrecords/`)
- Create: `database/procedures/objects/usp_ListGlobalObjectDefinitions.sql`
- Test: `database/tests/` tSQLt

**Interfaces:**
- Consumes: nullable `WorkspaceId` (Task 1).
- Produces: procs that treat a `Location='Global'` object as resolvable/valid from any workspace; a `usp_ListGlobalObjectDefinitions` for the platform tab.

- [ ] **Step 1: Relax `usp_GetObjectDefinitionById`**

Change the `WHERE` (currently `AND o.WorkspaceId = @Ws AND o.IsDeleted = 0`) to:
```sql
      AND  (o.WorkspaceId = @Ws OR o.Location = N'Global')
      AND  o.IsDeleted    = 0;
```

- [ ] **Step 2: Relax `usp_ListObjectDefinitions` (own + Global, local-wins dedup)**

Replace the body's SELECT with an own-∪-Global query deduped local-wins on `ObjectKey` (mirrors `usp_GetWorkspaceFields`):
```sql
    WITH candidates AS (
        SELECT o.ObjectDefinitionId, o.WorkspaceId, o.ObjectKey, o.Name, o.PluralLabel,
               o.Location, o.Description, o.ShowInSidebar, o.SidebarCategory,
               OwnRank = ROW_NUMBER() OVER (
                   PARTITION BY o.ObjectKey
                   ORDER BY CASE WHEN o.WorkspaceId = @Ws THEN 0 ELSE 1 END)
        FROM dbo.ObjectDefinition o
        WHERE o.IsDeleted = 0
          AND (o.WorkspaceId = @Ws OR o.Location = N'Global')
    )
    SELECT ObjectDefinitionId, WorkspaceId, ObjectKey, Name, PluralLabel,
           Location, Description, ShowInSidebar, SidebarCategory
    FROM candidates
    WHERE OwnRank = 1
    ORDER BY Name;
```

- [ ] **Step 3: `usp_GetCustomObjectCounts` — include Global, count per calling workspace**

Change the object set to include Global (`WHERE o.WorkspaceId = @Ws OR o.Location = N'Global'`), and change both correlated counts to scope on the calling `@Ws` (not `o.WorkspaceId`, which is NULL for Global):
```sql
           FieldsCount =
               (SELECT COUNT(1) FROM dbo.FieldDefinition f
                WHERE f.WorkspaceId = @Ws
                  AND f.ObjectType  = o.ObjectKey
                  AND f.IsDeleted   = 0
                  AND f.IsRetired   = 0),
           RecordsCount =
               (SELECT COUNT(1) FROM dbo.CustomRecords r
                WHERE r.WorkspaceId        = @Ws
                  AND r.ObjectDefinitionId = o.ObjectDefinitionId
                  AND r.IsDeleted          = 0)
    FROM   dbo.ObjectDefinition o
    WHERE  (o.WorkspaceId = @Ws OR o.Location = N'Global')
      AND  o.IsDeleted    = 0;
```
(For a local object `@Ws = o.WorkspaceId`, so this is behavior-identical; for a Global object it yields the calling workspace's record count and 0 fields.)

- [ ] **Step 4: `usp_CreateCustomRecord` — accept a Global object target**

Change the existence check (line ~35-38) to:
```sql
        IF NOT EXISTS (
            SELECT 1 FROM dbo.ObjectDefinition
            WHERE ObjectDefinitionId = @Obj AND (WorkspaceId = @Ws OR Location = N'Global') AND IsDeleted = 0)
            THROW 50083, 'Object definition not found in this workspace.', 1;
```
(The inserted record still carries `@Ws`.) **`usp_QueryCustomRecords` needs NO change** — it resolves the object by id without a workspace filter and scopes records by `cr.WorkspaceId=@ws`; its field whitelist reads `WorkspaceId=@Ws` fields, which is empty for a Global object in Slice 1 (Slice 2 will union Global fields there).

- [ ] **Step 5: `usp_UpsertObjectDefinition` — handle a NULL `@WorkspaceId` (Global create/edit)**

The proc currently assumes a non-null `@Ws`. Make the name-uniqueness check, the slug disambiguation loop, and the update-path existence check operate on the **Global** namespace when `@Ws IS NULL`. Concretely, replace the three `WHERE WorkspaceId = @Ws …` predicates with a scope expression that means "same namespace as the row being written":
- Name uniqueness (line ~50-56):
  ```sql
        IF EXISTS (
            SELECT 1 FROM dbo.ObjectDefinition
            WHERE ((@Ws IS NULL AND Location = N'Global') OR WorkspaceId = @Ws)
              AND Name = @Nm AND IsDeleted = 0
              AND (@Id IS NULL OR ObjectDefinitionId <> @Id))
            THROW 50081, 'An object with this name already exists in this workspace.', 1;
  ```
- Slug disambiguation loop (line ~92-98):
  ```sql
            WHILE EXISTS (
                SELECT 1 FROM dbo.ObjectDefinition
                WHERE ((@Ws IS NULL AND Location = N'Global') OR WorkspaceId = @Ws)
                  AND ObjectKey = @Slug AND IsDeleted = 0)
  ```
- Update-path existence check (line ~112-115):
  ```sql
            IF NOT EXISTS (
                SELECT 1 FROM dbo.ObjectDefinition
                WHERE ObjectDefinitionId = @Id
                  AND ((@Ws IS NULL AND Location = N'Global') OR WorkspaceId = @Ws) AND IsDeleted = 0)
                THROW 50080, 'Object definition not found.', 1;
  ```
- The INSERT (`VALUES (@Id, @Ws, …)`) and UPDATE `WHERE` already use `@Ws`; for the UPDATE's `WHERE ObjectDefinitionId=@Id AND WorkspaceId=@Ws`, change to `AND ((@Ws IS NULL AND Location=N'Global') OR WorkspaceId=@Ws)`. The INSERT stores `@Ws` (NULL for Global) — fine now that the column is nullable.
(No change to the caller contract; workspace create keeps passing a real `@Ws`.)

- [ ] **Step 6: New `usp_ListGlobalObjectDefinitions`**

Create `database/procedures/objects/usp_ListGlobalObjectDefinitions.sql` — all active Global custom objects (no workspace param), same column list as `usp_ListObjectDefinitions`:
```sql
CREATE OR ALTER PROCEDURE dbo.usp_ListGlobalObjectDefinitions
AS
BEGIN
    SET NOCOUNT ON;
    SELECT o.ObjectDefinitionId, o.WorkspaceId, o.ObjectKey, o.Name, o.PluralLabel,
           o.Location, o.Description, o.ShowInSidebar, o.SidebarCategory
    FROM   dbo.ObjectDefinition o
    WHERE  o.Location = N'Global' AND o.IsDeleted = 0
    ORDER  BY o.Name;
END;
GO
```
(Header comment per standards.)

- [ ] **Step 7: `usp_DeleteObjectDefinition` — allow Global delete**

Open `usp_DeleteObjectDefinition.sql`. If it filters `WHERE … AND WorkspaceId = @Ws`, relax the same way (`((@Ws IS NULL AND Location=N'Global') OR WorkspaceId=@Ws)`) so a platform delete (called with `@Ws=NULL`) can soft-delete a Global object. If it already keys only on `ObjectDefinitionId`, no change — note which in the report.

- [ ] **Step 8: tSQLt tests**

Add tests (find the existing objects test class via `grep -rln "usp_ListObjectDefinitions\|usp_UpsertObjectDefinition" database/tests`):
- `usp_ListObjectDefinitions` returns a Global object for a workspace that doesn't own it; a local object shadows a same-slug Global one (local-wins).
- `usp_GetObjectDefinitionById` resolves a Global object with a non-owning `@Ws`.
- `usp_UpsertObjectDefinition` with `@WorkspaceId = NULL` creates a Global row (NULL workspace, unique slug in the Global namespace).
- `usp_CreateCustomRecord` inserts a record (with the caller's workspace) against a Global object.
- `usp_GetCustomObjectCounts` returns the calling workspace's record count for a Global object.
Use `DECLARE @x = (SELECT…)` + `AssertEquals`; FakeTable `dbo.ObjectDefinition` / `dbo.CustomRecords` / `dbo.FieldDefinition`.

- [ ] **Step 9: Build + commit**

`dotnet build api/Api` (procs are SQL — build just confirms nothing else broke). Commit all proc files + tSQLt.
```bash
git -C <worktree> add database/procedures database/tests
git -C <worktree> commit -m "feat(sp3b): object + record procs surface/accept Global objects"
```

---

### Task 3: `ObjectSchemaService` — nullable mapping, Global list, platform CRUD

**Files:**
- Modify: `api/Api/Modules/Objects/ObjectSchemaService.cs`, `api/Api/Modules/Objects/ObjectDtos.cs`
- Test: `api/Api.Tests/` (find the existing ObjectSchemaService tests via grep)

**Interfaces:**
- Consumes: relaxed procs (Task 2); `ObjectDefinitionRow.WorkspaceId` now `Guid?`.
- Produces: `IObjectSchemaService.ListGlobalAsync(ct) → Task<IReadOnlyList<ObjectDefinitionDto>>`; `CreateGlobalAsync(request, actor, ct)`, `UpdateGlobalAsync(id, request, actor, ct)`, `DeleteGlobalAsync(id, actor, ct)` → `Task<ObjectMutationResult>`. `MapCustom` tolerates a null `WorkspaceId` (→ `Guid.Empty`).

- [ ] **Step 1: Failing tests**

In the ObjectSchemaService test file, add: `ListGlobalAsync` returns the built-in Global constants + Global custom rows (mock the `usp_ListGlobalObjectDefinitions` read); `CreateGlobalAsync` calls the upsert with a NULL workspace + `Location='Global'`; `UpdateGlobalAsync`/`DeleteGlobalAsync` on a non-Global id return `NotFound`. (Model on the existing ObjectSchemaService tests; these procs are DB-backed so tests may be light/integration-style — match the file's existing approach, e.g. pure `BuildCustomObjects`/`MapCustom` unit tests + a note that DB paths are covered by tSQLt/integration.)

- [ ] **Step 2: Nullable mapping**

`MapCustom(ObjectDefinitionRow row, …)` currently passes `row.WorkspaceId` (now `Guid?`) into a DTO field typed `Guid`. Change it to `row.WorkspaceId ?? Guid.Empty` (Global rows surface with `WorkspaceId = Guid.Empty`, the same convention `GetGlobalSystemObjects` uses). Confirm `BuildCustomObjects` still compiles (it calls `MapCustom`). `ListAsync` already returns Global rows now (the proc relaxed in Task 2) — Global custom objects appear in each workspace's list with `IsSystem=false, Location='Global', WorkspaceId=Guid.Empty`.

- [ ] **Step 3: `ListGlobalAsync` + platform mutations**

Add to `IObjectSchemaService` + impl:
- `ListGlobalAsync(ct)` → `GetGlobalSystemObjects()` (built-in constants, `IsSystem=true`) concatenated with the Global custom rows read via `usp_ListGlobalObjectDefinitions` (mapped through `BuildCustomObjects`/`MapCustom` with 0 counts).
- `CreateGlobalAsync(ObjectDefinitionCreateRequest request, Guid actorUserId, ct)` → call the existing private `UpsertAsync` but with `workspaceId: null` and `Location: "Global"` (ignore any Location in the request — Global is forced). `UpsertAsync` currently takes `Guid workspaceId`; add a nullable-workspace overload/path: the `@WorkspaceId` SqlParameter becomes `(object?)workspaceId ?? DBNull.Value`, and the read-back uses `GetByIdAsync(newId, Guid.Empty)` (the relaxed `usp_GetObjectDefinitionById` matches the Global row via `Location='Global'` regardless of the `@Ws` passed).
- `UpdateGlobalAsync(id, ObjectDefinitionPatchRequest request, actor, ct)` → verify the target is a Global custom object first (`GetByIdAsync(id, Guid.Empty)` returns it AND `Location=='Global' && !IsSystem`), else `NotFound`; then `UpsertAsync(id, workspaceId:null, …, Location:"Global", …)`.
- `DeleteGlobalAsync(id, actor, ct)` → same Global-target guard, then `DeleteAsync`-equivalent with `workspaceId:null` (calls `usp_DeleteObjectDefinition` with `@WorkspaceId=DBNull`).

Keep the existing workspace `CreateAsync`/`UpdateAsync`/`DeleteAsync` unchanged.

- [ ] **Step 4: DTOs**

`ObjectDtos.cs` — reuse `ObjectDefinitionCreateRequest` / `ObjectDefinitionPatchRequest` for the platform endpoints (Location is forced Global server-side, so the request's Location is ignored). No new DTO unless the platform request shape genuinely differs; if so, add `PlatformObjectCreateRequest`/`PlatformObjectPatchRequest` minimal records. Prefer reuse.

- [ ] **Step 5: Build + test + commit**

`dotnet build api/Api` then `dotnet test api/Api.Tests` — green.
```bash
git -C <worktree> add api/Api/Modules/Objects api/Api.Tests
git -C <worktree> commit -m "feat(sp3b): ObjectSchemaService Global list + platform create/update/delete"
```

---

### Task 4: Platform Object CRUD endpoints

**Files:**
- Modify: `api/Api/Modules/PlatformAdmin/PlatformSchemaController.cs`
- Test: `api/Api.Tests/` (platform controller tests; grep for the existing platform-admin test harness, e.g. `PlatformFieldsController` tests)

**Interfaces:**
- Consumes: `IObjectSchemaService.ListGlobalAsync` / `CreateGlobalAsync` / `UpdateGlobalAsync` / `DeleteGlobalAsync` (Task 3); `IAccessGuard.IsPlatformAdminAsync`.

- [ ] **Step 1: Failing tests**

Add controller tests: non-platform-admin → 403 on POST/PATCH/DELETE; platform-admin create → 200/201 with the object; patch/delete on a non-Global id → 404; duplicate name → 409. Model on the existing `PlatformFieldsController` / `PlatformSchemaController` test harness.

- [ ] **Step 2: Implement the endpoints**

In `PlatformSchemaController` (`[Route("api/v1/platform")]`), change `GET objects` to `await _objects.ListGlobalAsync(ct)` (built-ins + Global custom), and add (all gated by `IsPlatformAdminAsync`, mirroring `PlatformFieldsController.UpdatePlatformField`'s shape + the existing `AccessDenied()` helper):
- `[HttpPost("objects")] CreateObject([FromBody] ObjectDefinitionCreateRequest request, ct)` → `_objects.CreateGlobalAsync(request, _currentUser.UserId, ct)`; map `ObjectMutationOutcome` → 200 (Ok with the object) / 409 (InvalidState, duplicate name) / 400 (validation).
- `[HttpPatch("objects/{objectId:guid}")] UpdateObject(objectId, [FromBody] ObjectDefinitionPatchRequest request, ct)` → `UpdateGlobalAsync` → 200 / 404 (NotFound) / 409.
- `[HttpDelete("objects/{objectId:guid}")] DeleteObject(objectId, ct)` → `DeleteGlobalAsync` → 204 / 404.
Return ProblemDetails on the error branches (reuse the controller's `AccessDenied()`; add a `Validation`/`NotFound`/`Conflict` helper or inline `Problem(...)` per api-error-handling.md).

- [ ] **Step 3: Build + test + commit**

`dotnet build api/Api` then `dotnet test api/Api.Tests` — green.
```bash
git -C <worktree> add api/Api/Modules/PlatformAdmin api/Api.Tests
git -C <worktree> commit -m "feat(sp3b): platform-admin Global object CRUD endpoints"
```

---

### Task 5: Platform Objects tab — create / edit / delete

**Files:**
- Modify: `web/src/features/fields/components/PlatformObjectsTab.tsx`, `web/src/features/fields/usePlatformSchema.ts`, the platform objects api module (grep for where `usePlatformObjects` fetches — likely `web/src/features/fields/api.ts` or a platform api file)
- Test: colocated `.test.tsx`

**Interfaces:**
- Consumes: `POST/PATCH/DELETE /api/v1/platform/objects` (Task 4). `ObjectDefinitionDto` (`objectType`/`objectKey`, `name`, `pluralLabel`, `location`, `isSystem`, …).

- [ ] **Step 1: Read the precedents, write failing tests**

Read `PlatformObjectsTab.tsx` (current read-only table), the workspace `web/src/features/objects/components/ObjectEditorSheet.tsx` (the editor to adapt), and `PlatformFieldsCatalogTab.tsx` + `usePlatformSchema.ts` (the platform mutation precedent). Write tests: a "New object" button opens the editor; saving posts to the platform endpoint; editing a Global custom row patches; deleting confirms + deletes; built-in rows (isSystem) stay read-only (no edit/delete). jest-axe on the editor open state + the table.

- [ ] **Step 2: Implement**

- `usePlatformSchema.ts` (or a sibling): add `useCreatePlatformObject` / `useUpdatePlatformObject` / `useDeletePlatformObject` mutations calling the new endpoints (invalidate the `usePlatformObjects` query key). Add the api functions.
- `PlatformObjectsTab.tsx`: add a "New object" button and an editor sheet (adapt the workspace `ObjectEditorSheet` — **no Location control** since platform objects are always Global; fields = Name, Plural label, Description, sidebar options). Row actions Edit/Delete for `isSystem=false` custom rows only; built-in Global rows (`isSystem=true`) remain read-only. Delete uses a confirm (destructive) pattern already used elsewhere.
Follow `web-styling.md` / component + a11y rules; `data-ds` on any design-system component; no raw colors/radii.

- [ ] **Step 3: tsc + web tests + commit**

`cd web && npx tsc --noEmit` (import-export/fields scope clean) then `npx jest src/features/fields`. Commit.
```bash
git -C <worktree> add web/src/features/fields
git -C <worktree> commit -m "feat(sp3b): platform Objects tab create/edit/delete Global objects"
```

---

### Task 6: Workspace read-only surface for Global objects

**Files:**
- Modify: the workspace objects surface — `web/src/features/objects/components/ObjectEditorSheet.tsx` (or its loader/`ObjectsTab`) so a Global custom object (`location==='Global' && !isSystem`, i.e. not owned by the current workspace) opens **read-only/locked**, mirroring the field ForeignGlobal locked pattern.
- Test: colocated `.test.tsx`

**Interfaces:**
- Consumes: `ObjectDefinitionDto.location` / `.isSystem` / `.workspaceId` (Global custom = `location:'Global'`, `isSystem:false`, `workspaceId:Guid.Empty`).

- [ ] **Step 1: Failing test**

Read the current workspace Objects tab + editor. Write a test: a Global custom object row (location Global, not system) opens the editor **locked** (a lock banner + Close, no Save), like a foreign Global field. Confirm records still reachable ("View records" → `/objects/:objectKey`). jest-axe on the locked state.

- [ ] **Step 2: Implement**

In the workspace object editor, treat `location === 'Global' && !isSystem` as read-only for the current workspace (only platform admins edit Global objects). Reuse the existing locked-editor pattern (the unify-field-edit-sheet `readOnly`/`lockMessage` approach if the object editor shares it; otherwise disable the form + show a "This is a firm-wide object — managed by a platform admin" banner + a Close button). Built-in objects already render read-only; this extends that to Global custom objects. **No records-side change** — records CRUD/import/export already work per-workspace from the DB relaxations.

- [ ] **Step 3: tsc + web tests + commit**

`cd web && npx tsc --noEmit` then `npx jest src/features/objects`. Commit.
```bash
git -C <worktree> add web/src/features/objects
git -C <worktree> commit -m "feat(sp3b): workspace shows Global custom objects read-only"
```

---

## Self-Review

**1. Spec coverage:**
- Nullable `WorkspaceId` + Global unique indexes → Task 1. ✓
- List/GetById/Counts/CreateRecord/Upsert relaxations + `usp_ListGlobalObjectDefinitions`; Query proc needs no change → Task 2. ✓
- `ObjectSchemaService` Global list + platform CRUD → Task 3. ✓
- Platform-admin Object CRUD endpoints → Task 4. ✓
- Platform Objects tab editing → Task 5. ✓
- Workspace read-only Global surface (records work per-workspace) → Task 6. ✓
- Import/export/upsert auto-surface → free (IO descriptor resolves via the relaxed `ListAsync`; no task needed) — call out in the ship notes to smoke-test.
- No `dbo.CustomRecords` change; no custom fields (Slice 2) → honored throughout. ✓

**2. Placeholder scan:** none — `<NNN>` migration number is a deliberate build-time verification (Global Constraints). The "grep for the existing test harness / read the precedent" instructions are inherent to matching existing patterns, not content gaps; the exact transformations + new SQL are given verbatim.

**3. Type consistency:** `ObjectDefinitionRow.WorkspaceId: Guid?` (Task 1) → `MapCustom … ?? Guid.Empty` (Task 3). `ListGlobalAsync` / `CreateGlobalAsync` / `UpdateGlobalAsync` / `DeleteGlobalAsync` signatures defined in Task 3, consumed in Task 4. The relaxed `usp_GetObjectDefinitionById` (Task 2) is what makes `GetByIdAsync(id, Guid.Empty)` resolve a Global object in Task 3. Web consumes `location`/`isSystem`/`workspaceId` already on `ObjectDefinitionDto`.

**4. Risk / ambiguity:** the `ALTER COLUMN` nullability change and the index drop/recreate are the highest-risk step — Task 1 drops the two unique indexes first, alters, then recreates re-scoped + adds Global indexes (and the rollback guards against NULL rows). The `usp_UpsertObjectDefinition` NULL-workspace branching is enumerated predicate-by-predicate in Task 2 Step 5. Every relaxation is `(WorkspaceId=@Ws OR Location='Global')` — behavior-identical for local objects.
