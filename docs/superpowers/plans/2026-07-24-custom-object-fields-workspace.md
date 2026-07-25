# Fields on custom objects (workspace/Local) + "Global"→"Platform" rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a workspace admin author (add/edit/retire) `FieldDefinition`s on a custom object from the existing **Fields & objects → Fields** tab — Local-Workspace scoped — so those fields immediately drive the SP2 record forms; plus close the SP1 slug-truncation/CHECK gaps in the DB layer, and rename the "Global" field-location display label to "Platform".

**Architecture:** Reuse-heavy. The flat Fields catalog already surfaces custom-object user fields as editable rows, and a full field editor already exists (`FieldEditorSheet` + `createField`/`updateField`/`retireField`). SP3 = (1) make custom objects **selectable** in the editor's Object dropdown (Location locked to Local Workspace), (2) widen three C# controller guards to resolve custom slugs (404-never-disclose) and reject Global-on-custom (400), (3) fix the DB write path so slugs longer than 16 chars and rules on custom-object fields actually persist, (4) a display-only label rename.

**Tech Stack:** React 19 + TypeScript 5 (web), ASP.NET Core + EF Core (`FromSqlRaw` over stored procs), Azure SQL / T-SQL stored procedures, xUnit + Moq (api), Jest + React Testing Library + jest-axe (web), tSQLt (database).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-24-custom-object-fields-workspace-design.md`. This plan implements it exactly, including the Part 3b foundation fix discovered during planning.
- **Scope is workspace/Local only.** Custom-object fields are `Location = 'LocalWorkspace'`, forced and disabled in the UI, rejected server-side if `Global`. The platform/Global-custom-object path is deferred to SP3b — do **not** build it here.
- **Rename is display-label only.** The stored value stays `'Global'` everywhere (DB, DTOs, TS `FieldLocation` member). Only user-facing strings change; "Local Workspace" is unchanged.
- **Object-type validity is app-enforced**, never a DB CHECK (SP1 dropped `CK_FieldDefinition_ObjectType`; this plan drops `CK_FieldRuleDependency_ObjectType`). Unknown/inaccessible slug → **404, never disclosing existence** (mirror `FieldsController.GetFields`). Global on a custom object → **400**.
- **Next migration number is 088.** Re-verify against `ls database/migrations/` on freshly-reset `origin/dev` at build time — the number collides under concurrent shipping (see the project's ship-gotchas). Migrations are idempotent (`IF [NOT] EXISTS`) with a rollback; procs use `CREATE OR ALTER` (no migration).
- **No new dependencies.** Follow existing patterns; keep changes surgical (`.claude/rules/dev/_core-requirements.md`).
- **Naming/typing:** keep the closed `FieldObjectType` union; widen only at the editor/api boundary via a new `FieldObjectTypeOrSlug = FieldObjectType | (string & {})` (mirrors SP2's cast-at-one-boundary discipline).
- **Tests ship in the slice.** Every new web file gets a colocated `.test.tsx` with a jest-axe assertion across each meaningfully different rendered state; every C# branch gets an xUnit case; each changed proc/table gets a tSQLt round-trip. tSQLt runs in CI only (can't run locally). Design gates (`design-conformance`, `design-fidelity-web`) trigger on `.tsx/.css/.scss` — see the project's ship-gotchas for the waiver ceremony.
- **Ship as ONE slice** (`slice/custom-object-fields` or similar) via the project's `/dev-review-and-remediate` → `/dev-ship` flow. Tasks below are review-gate units within that slice, ordered backend-first because the frontend depends on the API accepting slugs.

---

## Task 1: Migration 088 — allow custom-object field rules (`FieldRuleDependency`)

`usp_UpsertFieldDefinition` inserts one `FieldRuleDependency` row per rule, keyed by `(WorkspaceId, ObjectType, …)`. That table's `ObjectType` is `NVARCHAR(16)` **and** carries `CK_FieldRuleDependency_ObjectType CHECK (ObjectType IN ('Request','Task','Feature'))`, which rejects any custom slug. Mirror migration 078 (which did this for `FieldDefinition`): drop the dependent index, widen the column, recreate the index, drop the CHECK.

**Files:**
- Create: `database/migrations/20260724_088_AllowCustomObjectFieldRules.sql`
- Create: `database/migrations/20260724_088_AllowCustomObjectFieldRules_Rollback.sql`
- Reference (do not edit): `database/migrations/20260724_078_AllowCustomObjectFields.sql` (the exact pattern), `database/migrations/20260703_018_CreateFieldRuleDependency.sql` (original table + index def).

**Interfaces:**
- Produces: `dbo.FieldRuleDependency.ObjectType` is `NVARCHAR(64)`, no `CK_FieldRuleDependency_ObjectType`, `IX_FieldRuleDependency_Workspace_Object` intact. Task 2's rule round-trip test depends on this.

- [ ] **Step 1: Write the forward migration**

Create `database/migrations/20260724_088_AllowCustomObjectFieldRules.sql`:

```sql
-- =============================================
-- Author:      SP3 — Fields on custom objects
-- Create Date: 2026-07-24
-- Description: Lets dbo.FieldRuleDependency hold rows for CUSTOM-object fields. The field upsert proc
--              inserts one dependency row per condition rule, keyed by (WorkspaceId, ObjectType, …).
--              Two changes mirror migration 078 (which did this for dbo.FieldDefinition):
--                1. Widen ObjectType NVARCHAR(16) -> NVARCHAR(64) so it can hold a custom object's
--                   slug (ObjectKey, up to 64 chars). ObjectType participates in the composite index
--                   IX_FieldRuleDependency_Workspace_Object, dropped before the ALTER and recreated.
--                2. Drop CK_FieldRuleDependency_ObjectType (IN 'Request','Task','Feature') — validity
--                   is enforced in the application against dbo.ObjectDefinition, not a fixed list.
--              Idempotent; self-heals on re-run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Widen ObjectType — only while it is still the narrow 16-wide column (max_length 32 bytes).
--    Drop the composite index that references ObjectType first (recreated below).
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.FieldRuleDependency')
      AND name = N'ObjectType'
      AND max_length = 32)
BEGIN
    DROP INDEX IF EXISTS IX_FieldRuleDependency_Workspace_Object ON dbo.FieldRuleDependency;

    ALTER TABLE dbo.FieldRuleDependency ALTER COLUMN ObjectType NVARCHAR(64) NOT NULL;
END;
GO

-- 2. Recreate the composite index with its original definition (idempotent, self-healing).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    CREATE NONCLUSTERED INDEX IX_FieldRuleDependency_Workspace_Object
        ON dbo.FieldRuleDependency (WorkspaceId, ObjectType)
        INCLUDE (FromFieldKey, ToFieldKey) WHERE IsDeleted = 0;
GO

-- 3. Drop the object-type CHECK — validity is enforced in the app against dbo.ObjectDefinition.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldRuleDependency_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    ALTER TABLE dbo.FieldRuleDependency DROP CONSTRAINT CK_FieldRuleDependency_ObjectType;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_088_AllowCustomObjectFieldRules')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260724_088_AllowCustomObjectFieldRules', SUSER_SNAME(),
            N'Custom-object field rules — widen FieldRuleDependency.ObjectType to NVARCHAR(64) and drop the ObjectType CHECK.');
END;
GO
```

- [ ] **Step 2: Write the rollback** (mirror 078's rollback — only reverse when data still fits)

Create `database/migrations/20260724_088_AllowCustomObjectFieldRules_Rollback.sql`:

```sql
-- =============================================
-- Author:      SP3 — Fields on custom objects
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_088_AllowCustomObjectFieldRules. Restores the ObjectType CHECK
--              and narrows the column back to NVARCHAR(16) — but ONLY when the data still fits the
--              original built-in-only model. If any custom-object rule rows exist (ObjectType not in
--              the built-in set, or a slug longer than 16 chars), those steps are skipped and left
--              as-is (narrowing/re-checking would fail or silently drop data). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Re-add the object-type CHECK only if no row would violate it (i.e. no custom-object rules).
IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_FieldRuleDependency_ObjectType'
          AND parent_object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
   AND NOT EXISTS (
        SELECT 1 FROM dbo.FieldRuleDependency
        WHERE ObjectType NOT IN (N'Request', N'Task', N'Feature'))
    ALTER TABLE dbo.FieldRuleDependency
        ADD CONSTRAINT CK_FieldRuleDependency_ObjectType
        CHECK (ObjectType IN (N'Request', N'Task', N'Feature'));
GO

-- 2. Narrow ObjectType back to NVARCHAR(16) only while it is currently 64 wide (max_length 128) AND
--    every value fits in 16 chars. Drop the composite index first (recreated below).
IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.FieldRuleDependency')
          AND name = N'ObjectType'
          AND max_length = 128)
   AND NOT EXISTS (SELECT 1 FROM dbo.FieldRuleDependency WHERE LEN(ObjectType) > 16)
BEGIN
    DROP INDEX IF EXISTS IX_FieldRuleDependency_Workspace_Object ON dbo.FieldRuleDependency;

    ALTER TABLE dbo.FieldRuleDependency ALTER COLUMN ObjectType NVARCHAR(16) NOT NULL;
END;
GO

-- 3. Recreate the composite index if missing (self-healing whether or not step 2 ran).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    CREATE NONCLUSTERED INDEX IX_FieldRuleDependency_Workspace_Object
        ON dbo.FieldRuleDependency (WorkspaceId, ObjectType)
        INCLUDE (FromFieldKey, ToFieldKey) WHERE IsDeleted = 0;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_088_AllowCustomObjectFieldRules';
GO
```

- [ ] **Step 3: Apply locally and verify idempotency**

Run the forward migration twice against the local dev DB (persists across sessions) via PowerShell `Invoke-Sqlcmd` (no `sqlcmd`):

```powershell
Invoke-Sqlcmd -ServerInstance "(localdb)\MSSQLLocalDB" -Database "AiSolutionsTrackerDev" -InputFile "database/migrations/20260724_088_AllowCustomObjectFieldRules.sql"
Invoke-Sqlcmd -ServerInstance "(localdb)\MSSQLLocalDB" -Database "AiSolutionsTrackerDev" -InputFile "database/migrations/20260724_088_AllowCustomObjectFieldRules.sql"
```

Expected: both runs succeed (idempotent). Then verify:

```powershell
Invoke-Sqlcmd -ServerInstance "(localdb)\MSSQLLocalDB" -Database "AiSolutionsTrackerDev" -Query "SELECT c.max_length FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.FieldRuleDependency') AND c.name = 'ObjectType'; SELECT COUNT(*) AS ChkCount FROM sys.check_constraints WHERE name = 'CK_FieldRuleDependency_ObjectType';"
```

Expected: `max_length = 128` (NVARCHAR(64) = 128 bytes), `ChkCount = 0`.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/20260724_088_AllowCustomObjectFieldRules.sql database/migrations/20260724_088_AllowCustomObjectFieldRules_Rollback.sql
git commit -m "feat(sp3): migration 088 — allow custom-object field rules (FieldRuleDependency widen + drop CHECK)"
```

---

## Task 2: Widen `@ObjectType` to `NVARCHAR(64)` in the six field procs (+ tSQLt round-trip)

The `FieldDefinition.ObjectType` column is `NVARCHAR(64)` (migration 078) but six procs still declare the parameter `NVARCHAR(16)`, silently truncating any slug over 16 chars on write and read. Widen the parameter (and its `@ObjectTypeLocal` copy where present) to `NVARCHAR(64)`. This is a pure parameter-width change — built-in object types (≤8 chars) are unaffected. Procs are `CREATE OR ALTER` and reapplied every deploy, so no migration.

**Files:**
- Modify: `database/procedures/fields/usp_UpsertFieldDefinition.sql` (`@ObjectType`, `@ObjectTypeLocal`)
- Modify: `database/procedures/fields/usp_RetireFieldDefinition.sql` (`@ObjectType`, `@ObjectTypeLocal`)
- Modify: `database/procedures/fields/usp_GetWorkspaceFields.sql` (`@ObjectType`, `@ObjectTypeLocal`)
- Modify: `database/procedures/fields/usp_GetWorkspaceFieldDependencies.sql` (`@ObjectType`, and `@ObjectTypeLocal` if declared)
- Modify: `database/procedures/fields/usp_GetWorkspaceFieldOptions.sql` (same)
- Modify: `database/procedures/fields/usp_GetWorkspaceFieldRules.sql` (same)
- Create: `database/tests/fields/test_usp_UpsertFieldDefinition_CustomObjectSlug.sql` (tSQLt)

**Interfaces:**
- Consumes: Task 1's migration (the `FieldRuleDependency` CHECK must be gone for the rule round-trip).
- Produces: all six field procs accept a 64-char `@ObjectType`; a custom-object field with a rule upserts without a CHECK violation.

- [ ] **Step 1: Widen the parameter declarations**

In each of the six files, change the parameter declaration and any local copy from `NVARCHAR(16)` to `NVARCHAR(64)`. Concretely, in `usp_UpsertFieldDefinition.sql`:

```sql
-- before
@ObjectType         NVARCHAR(16),
...
DECLARE @ObjectTypeLocal  NVARCHAR(16)     = @ObjectType;
-- after
@ObjectType         NVARCHAR(64),
...
DECLARE @ObjectTypeLocal  NVARCHAR(64)     = @ObjectType;
```

Repeat the identical width change in `usp_RetireFieldDefinition.sql`, `usp_GetWorkspaceFields.sql`, `usp_GetWorkspaceFieldDependencies.sql`, `usp_GetWorkspaceFieldOptions.sql`, `usp_GetWorkspaceFieldRules.sql`. Do not change any other logic. (Grep each file for `NVARCHAR(16)` and change only the `@ObjectType`/`@ObjectTypeLocal` occurrences — leave any unrelated 16-wide params, e.g. status codes, untouched.)

- [ ] **Step 2: Apply the procs locally**

```powershell
foreach ($p in @('usp_UpsertFieldDefinition','usp_RetireFieldDefinition','usp_GetWorkspaceFields','usp_GetWorkspaceFieldDependencies','usp_GetWorkspaceFieldOptions','usp_GetWorkspaceFieldRules')) {
  Invoke-Sqlcmd -ServerInstance "(localdb)\MSSQLLocalDB" -Database "AiSolutionsTrackerDev" -InputFile "database/procedures/fields/$p.sql"
}
```

Expected: all succeed (CREATE OR ALTER).

- [ ] **Step 3: Write the tSQLt round-trip test**

Create `database/tests/fields/test_usp_UpsertFieldDefinition_CustomObjectSlug.sql`. Author to FakeTable/AAA; use `DECLARE @x = (SELECT …)` + `AssertEquals`, never inline `@Actual=(SELECT…)` (the repo's tSQLt convention; the inline form does not compile here). Two facts: a >16-char slug survives the upsert→read round-trip, and a field carrying a rule upserts without a CHECK violation.

```sql
-- =============================================
-- Author:      SP3 — Fields on custom objects
-- Description: usp_UpsertFieldDefinition preserves a custom-object slug longer than 16 chars
--              (would truncate under the old NVARCHAR(16) param), and a custom-object field with a
--              condition rule upserts without hitting the dropped CK_FieldRuleDependency_ObjectType.
-- =============================================
EXEC tSQLt.NewTestClass 'FieldsUpsertTests';
GO

CREATE PROCEDURE FieldsUpsertTests.[test long custom-object slug survives the upsert round-trip]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable 'dbo.FieldRuleDependency';
    EXEC tSQLt.FakeTable 'dbo.FieldOptions';   -- referenced by the upsert; fake to isolate
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'thirdpartyriskassessment';   -- 24 chars, > 16

    -- Act — the proc's required params are @WorkspaceId, @ObjectType, @FieldKey, @DisplayName,
    -- @FieldType, @Category, @ActorUserId (all others default). See usp_UpsertFieldDefinition.sql.
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'Owner',
        @DisplayName = N'Owner', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';

    DECLARE @Stored NVARCHAR(64) =
        (SELECT TOP 1 ObjectType FROM dbo.FieldDefinition WHERE WorkspaceId = @Ws AND FieldKey = N'Owner');

    -- Assert — the full 24-char slug is preserved, not truncated to 16.
    EXEC tSQLt.AssertEquals @Slug, @Stored;
END;
GO
```

Add a second test proc `FieldsUpsertTests.[test custom-object field with a dependency upserts without a CHECK violation]`. The proc inserts one `dbo.FieldRuleDependency` row per edge in `@DependenciesJson` (keyed by `ObjectType`), which is exactly the path that hit `CK_FieldRuleDependency_ObjectType` before Task 1 dropped it. FakeTable the same three tables, upsert two fields on the slug (`Owner`, then a dependent field), pass a `@DependenciesJson` edge array (read the proc's `OPENJSON(@DependenciesJson)` shape for the exact `ToFieldKey` property name), and assert one dependency row exists:

```sql
DECLARE @Count INT =
    (SELECT COUNT(*) FROM dbo.FieldRuleDependency WHERE WorkspaceId = @Ws AND ObjectType = @Slug);
EXEC tSQLt.AssertEquals 1, @Count;
```

This passes only because Task 1 widened the column and dropped the CHECK; against the old schema the upsert would throw a CHECK violation on the insert.

- [ ] **Step 4: Note on running**

tSQLt cannot run locally in this repo (no framework vendored). The test runs in CI. Verify the proc change locally instead with a raw round-trip:

```powershell
Invoke-Sqlcmd -ServerInstance "(localdb)\MSSQLLocalDB" -Database "AiSolutionsTrackerDev" -Query "DECLARE @Ws UNIQUEIDENTIFIER = NEWID(); EXEC dbo.usp_UpsertFieldDefinition @WorkspaceId=@Ws, @ObjectType=N'thirdpartyriskassessment', @FieldKey=N'Owner', @DisplayName=N'Owner', @FieldType=N'ShortText', @Category=N'WorkspaceLocal', @Location=N'LocalWorkspace', @ActorUserId=N'tester'; SELECT ObjectType, LEN(ObjectType) AS L FROM dbo.FieldDefinition WHERE WorkspaceId=@Ws AND FieldKey=N'Owner';"
```

Expected: `ObjectType = thirdpartyriskassessment`, `L = 24` (not 16). NB: `usp_UpsertFieldDefinition` performs the dependency-graph work against real tables — if this raw run fails on a missing dependency, wrap it in a transaction you roll back, or rely on the tSQLt test (which FakeTables) for the authoritative check.

- [ ] **Step 5: Commit**

```bash
git add database/procedures/fields/ database/tests/fields/test_usp_UpsertFieldDefinition_CustomObjectSlug.sql
git commit -m "fix(sp3): widen @ObjectType to NVARCHAR(64) in field procs so custom-object slugs don't truncate"
```

---

## Task 3: C# object-type guards on Create / Update / Retire (+ xUnit)

Three `FieldsController` handlers must resolve a possibly-custom `objectType` and reject an unknown slug with **404 (never disclose)** and a Global-on-custom field with **400** — mirroring the already-widened `GetFields`. Factor the resolution into one shared helper.

**Files:**
- Modify: `api/Api/Modules/Fields/FieldsController.cs` (add helper; guard `CreateField`, `UpdateField`, `RetireField`)
- Test: `api/Api.Tests/FieldsControllerObjectTypeTests.cs` (extend — the mocking harness is already here)

**Interfaces:**
- Consumes: `IObjectSchemaService.ListAsync(Guid workspaceId, CancellationToken) → IReadOnlyList<ObjectDefinitionDto>`; `ObjectDefinitionDto` has `ObjectKey` (string), `IsSystem` (bool). `FieldDefinitionUpsertRequest` has `string? ObjectType` and `string Location` (default `"LocalWorkspace"`). Existing `IsValidObjectType(string) => "Request" or "Task" or "Feature" or "ToolkitItem" or "Attachment"`.
- Produces: create/update/retire return 404 for an unknown slug, 400 for Global-on-custom, unchanged behaviour for built-ins.

- [ ] **Step 1: Write the failing tests** (extend `FieldsControllerObjectTypeTests.cs`)

The existing `Build(...)` helper mocks `HasWorkspaceLevelAsync(... Viewer ...)` → true; the write handlers need `WorkspaceAdmin`. Add an admin-capable builder and the new cases. Append to the class:

```csharp
private static FieldsController BuildAdmin(
    Mock<IFieldSchemaService> fields,
    IReadOnlyList<ObjectDefinitionDto>? objects = null)
{
    var accessGuard = new Mock<IAccessGuard>();
    accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, It.IsAny<WorkspaceLevel>(), It.IsAny<CancellationToken>()))
        .ReturnsAsync(true);

    var currentUser = new Mock<ICurrentUser>();
    currentUser.SetupGet(user => user.UserId).Returns(UserId);

    var objectsMock = new Mock<IObjectSchemaService>();
    objectsMock.Setup(service => service.ListAsync(WorkspaceId, It.IsAny<CancellationToken>()))
        .ReturnsAsync(objects ?? Array.Empty<ObjectDefinitionDto>());

    var httpContext = new DefaultHttpContext();
    httpContext.Items[OperationIdMiddleware.HeaderName] = "op-123";
    return new FieldsController(fields.Object, objectsMock.Object, accessGuard.Object, currentUser.Object)
    {
        ControllerContext = new ControllerContext { HttpContext = httpContext },
    };
}

private static FieldDefinitionUpsertRequest UpsertReq(string objectType, string location = "LocalWorkspace") => new()
{
    ObjectType = objectType, Location = location, FieldKey = "Owner",
    DisplayName = "Owner", FieldType = "ShortText", Category = "WorkspaceLocal",
};

[Fact]
public async Task CreateField_UnknownSlug_Returns404()
{
    var fields = new Mock<IFieldSchemaService>();
    var sut = BuildAdmin(fields, new[] { CustomObject("vendor") });

    var result = await sut.CreateField(WorkspaceId, UpsertReq("ghost"), CancellationToken.None);

    Assert.IsType<NotFoundResult>(result);
    fields.Verify(s => s.UpsertFieldAsync(It.IsAny<Guid>(), It.IsAny<FieldDefinitionUpsertRequest>(),
        It.IsAny<bool>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
}

[Fact]
public async Task CreateField_CustomObjectWithGlobalLocation_Returns400()
{
    var fields = new Mock<IFieldSchemaService>();
    var sut = BuildAdmin(fields, new[] { CustomObject("vendor") });

    var result = await sut.CreateField(WorkspaceId, UpsertReq("vendor", location: "Global"), CancellationToken.None);

    var problem = Assert.IsType<ObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, problem.StatusCode);
    fields.Verify(s => s.UpsertFieldAsync(It.IsAny<Guid>(), It.IsAny<FieldDefinitionUpsertRequest>(),
        It.IsAny<bool>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
}

[Fact]
public async Task RetireField_UnknownSlug_Returns404()
{
    var fields = new Mock<IFieldSchemaService>();
    var sut = BuildAdmin(fields, new[] { CustomObject("vendor") });

    var result = await sut.RetireField(WorkspaceId, "Owner", "ghost", CancellationToken.None);

    Assert.IsType<NotFoundResult>(result);
}

[Fact]
public async Task CreateField_ValidCustomSlug_ProceedsToUpsert()
{
    // Arrange — the slug resolves, so the guard passes and the service is invoked. We assert the
    // call happened (a ValidationFailed result avoids constructing a full FieldDefinitionDto).
    var fields = new Mock<IFieldSchemaService>();
    fields.Setup(s => s.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(),
            true, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()))
        .ReturnsAsync(new FieldOperationResult(FieldOperationOutcome.ValidationFailed, Errors: new[] { "x" }));
    var sut = BuildAdmin(fields, new[] { CustomObject("vendor") });

    // Act
    await sut.CreateField(WorkspaceId, UpsertReq("vendor"), CancellationToken.None);

    // Assert — the guard let the request through to the service (slug resolved).
    fields.Verify(s => s.UpsertFieldAsync(WorkspaceId, It.IsAny<FieldDefinitionUpsertRequest>(),
        true, UserId, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
}
```

`FieldOperationResult`/`FieldOperationOutcome` live in `api/Api/Modules/Fields/FieldSchemaService.cs` (already imported by the test namespace). The `Success` 201-mapping is already covered by `FieldsControllerTests.CreateField_Success_Returns201` — do not duplicate it; these ObjectType tests only prove the new slug guard.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test api/Api.Tests/Api.Tests.csproj --filter FullyQualifiedName~FieldsControllerObjectTypeTests`
Expected: FAIL — `CreateField`/`RetireField` currently do not resolve the slug (create ignores objectType; retire returns 400 via `IsValidObjectType`).

- [ ] **Step 3: Add the shared resolver + wire the guards**

In `FieldsController.cs`, add a private enum + helper next to `IsValidObjectType`:

```csharp
private enum ObjectResolution { BuiltIn, Custom, NotFound }

// Resolves a possibly-custom objectType: a built-in passes; any other value must resolve to a real
// NON-system ObjectDefinition in this workspace, else NotFound (never disclosing existence). Mirrors
// the GetFields slug check so all field endpoints agree.
private async Task<ObjectResolution> ResolveObjectTypeAsync(
    Guid workspaceId, string? objectType, CancellationToken cancellationToken)
{
    if (objectType is not null && IsValidObjectType(objectType))
    {
        return ObjectResolution.BuiltIn;
    }

    var objects = await _objects.ListAsync(workspaceId, cancellationToken);
    var match = objects.FirstOrDefault(candidate =>
        !candidate.IsSystem && string.Equals(candidate.ObjectKey, objectType, StringComparison.Ordinal));
    return match is null ? ObjectResolution.NotFound : ObjectResolution.Custom;
}
```

Refactor `GetFields` to use it (replaces the inline block; behaviour identical):

```csharp
if (await ResolveObjectTypeAsync(workspaceId, objectType, cancellationToken) == ObjectResolution.NotFound)
{
    return NotFound();
}
```

In `CreateField`, after the `WorkspaceAdmin` access check and before `UpsertFieldAsync`:

```csharp
var resolution = await ResolveObjectTypeAsync(workspaceId, request.ObjectType, cancellationToken);
if (resolution == ObjectResolution.NotFound)
{
    return NotFound();
}
if (resolution == ObjectResolution.Custom &&
    string.Equals(request.Location, "Global", StringComparison.Ordinal))
{
    return BadRequestProblem("Custom-object fields are workspace-local and cannot be Global.");
}
```

In `UpdateField`, apply the same two guards after the access check (using `request.ObjectType`), before `UpsertFieldAsync` — the client fixes the object on edit, but the API must not trust it (defense-in-depth).

In `RetireField`, replace the existing `IsValidObjectType` gate:

```csharp
// before
if (!IsValidObjectType(objectType))
{
    return BadRequestProblem("Object type must be one of Request, Task, Feature, Toolkit item, or Attachment.");
}
// after
if (await ResolveObjectTypeAsync(workspaceId, objectType, cancellationToken) == ObjectResolution.NotFound)
{
    return NotFound();
}
```

Keep the access-guard ordering: resolve **after** the `WorkspaceAdmin`/`Viewer` check so a non-member cannot probe object existence (matches `GetFields`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test api/Api.Tests/Api.Tests.csproj --filter FullyQualifiedName~FieldsControllerObjectTypeTests`
Expected: PASS. Then run the full fields suite to confirm no regression: `dotnet test api/Api.Tests/Api.Tests.csproj --filter FullyQualifiedName~Fields`

- [ ] **Step 5: Commit**

```bash
git add api/Api/Modules/Fields/FieldsController.cs api/Api.Tests/FieldsControllerObjectTypeTests.cs
git commit -m "feat(sp3): resolve custom-object slugs on field create/update/retire (404 unknown, 400 global-on-custom)"
```

---

## Task 4: Frontend — custom objects selectable in the Fields editor (+ tests)

Widen the editor/api typing at the boundary, feed the workspace's custom objects into the Object dropdown, and lock Location to Local Workspace when a custom object is selected.

**Files:**
- Modify: `shared/types/fields.ts` (add `FieldObjectTypeOrSlug`; widen `FieldDefinitionUpsertRequest.objectType`)
- Modify: `web/src/features/fields/fieldForm.ts` (`FieldForm.object`, `buildInitialForm` param)
- Modify: `web/src/features/fields/api.ts` (`retireField` objectType param)
- Modify: `web/src/features/fields/useFields.ts` (`useWorkspaceFields`/`fetchWorkspaceFields` objectType param — grep for the signature)
- Modify: `web/src/features/fields/components/FieldEditorSheet.tsx` (Object optgroup; Location lock)
- Modify: `web/src/features/fields/components/FieldEditLoader.tsx` (forward custom options; widen objectType prop)
- Modify: `web/src/features/fields/components/FieldsCatalogTab.tsx` (fetch `useWorkspaceObjects`; build + pass custom options)
- Test: `web/src/features/fields/components/FieldEditorSheet.test.tsx` (extend)
- Test: `web/src/features/fields/components/FieldsCatalogTab.test.tsx` (extend)

**Interfaces:**
- Consumes: `useWorkspaceObjects(workspaceId) → UseQueryResult<ObjectDefinitionDto[]>` from `@/features/objects` (barrel export). `ObjectDefinitionDto` has `objectKey`, `name`, `isSystem`.
- Produces: a `customObjectOptions: readonly { value: string; label: string }[]` prop threaded into `FieldEditorSheet` (via `FieldsCatalogTab` for create, via `FieldEditLoader` for edit). Task 5 (rename) is independent of this task.

- [ ] **Step 1: Add the boundary type + widen the request type**

In `shared/types/fields.ts`, after the `FieldObjectType` declaration:

```ts
/**
 * The editor/api boundary type for an object a field belongs to: a built-in object type OR a custom
 * object's slug. `(string & {})` keeps built-in autocomplete while allowing any slug. Used only where
 * a custom slug must flow (the field editor and the create/update/retire calls); the closed
 * `FieldObjectType` union stays in place everywhere else.
 */
export type FieldObjectTypeOrSlug = FieldObjectType | (string & {});
```

Change `FieldDefinitionUpsertRequest.objectType` from `FieldObjectType` to `FieldObjectTypeOrSlug`. (Widening a write-request field to a supertype is safe — existing built-in producers still compile.)

- [ ] **Step 2: Widen the form + api + hook types**

- `fieldForm.ts`: `FieldForm.object: FieldObjectTypeOrSlug`; `buildInitialForm(field, objectType: FieldObjectTypeOrSlug, …)`. `formToRequest` already returns `objectType: form.object` — now type-compatible.
- `api.ts`: `retireField(workspaceId, fieldKey, objectType: FieldObjectTypeOrSlug)`.
- `useFields.ts`: widen the `objectType` param of `useWorkspaceFields` and `fetchWorkspaceFields` (whichever carry `FieldObjectType`) to `FieldObjectTypeOrSlug` (grep the file for `FieldObjectType`).

Import `FieldObjectTypeOrSlug` from `@shared/types` in each. Run `npx tsc --noEmit` (from `web/`) — expect no new errors (there are ~10 pre-existing tsc errors in relationships/audit unrelated to this change; confirm you add none).

- [ ] **Step 3: Write the failing editor tests**

In `FieldEditorSheet.test.tsx`, add a `customObjectOptions` fixture and assert the option renders and Location locks. Example:

```tsx
it('FieldEditorSheet — custom object selected — Object option shown and Location locked', async () => {
  // Arrange
  const onSave = jest.fn();
  render(
    <FieldEditorSheet
      initialObjectType="vendor"
      field={null}
      customObjectOptions={[{ value: 'vendor', label: 'Vendor' }]}
      availableKeysByObject={{}}
      saveError={null}
      isSaving={false}
      onSave={onSave}
      onClose={jest.fn()}
    />,
  );

  // Assert — the custom object is the selected Object, and Location is Local Workspace + disabled
  const objectSelect = screen.getByRole('combobox', { name: /object/i });
  expect(objectSelect).toHaveValue('vendor');
  const locationSelect = screen.getByRole('combobox', { name: /location/i });
  expect(locationSelect).toBeDisabled();
  expect(locationSelect).toHaveValue('LocalWorkspace');
});
```

Add a jest-axe assertion (`expect(await axe(container)).toHaveNoViolations()`) in a custom-object-selected render. (Note: the current `<label><span class="caption">Object</span><select>` markup associates the label via wrapping; if `getByRole('combobox', { name: … })` doesn't resolve the accessible name, add `aria-label` to the selects as part of this task — that also satisfies the accessibility rule for the newly-conditional control.)

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- FieldEditorSheet` (from `web/`)
Expected: FAIL — `customObjectOptions` prop doesn't exist; Location isn't locked.

- [ ] **Step 5: Implement the editor changes**

In `FieldEditorSheet.tsx`:
- Add to props: `customObjectOptions: readonly { value: string; label: string }[];` and change `initialObjectType` + `availableKeysByObject` key types to `FieldObjectTypeOrSlug` / `Partial<Record<string, string[]>>`.
- Compute `const isCustomObject = customObjectOptions.some((option) => option.value === form.object);`
- Render the Object `<select>` with the built-in options plus a custom `<optgroup>`:

```tsx
<select className="mws-select" aria-label="Object" value={form.object} disabled={!isCreate}
  onChange={(event) => {
    const nextObject = event.target.value;
    const nextIsCustom = customObjectOptions.some((option) => option.value === nextObject);
    const nextOptions = nextObject === 'Task' ? TASK_FIELD_TYPE_OPTIONS : FIELD_TYPE_OPTIONS;
    const stillValid = nextOptions.some((option) => option.value === form.fieldType);
    patch({
      object: nextObject,
      fieldType: stillValid ? form.fieldType : (nextOptions[0]?.value ?? 'ShortText'),
      // Custom-object fields are workspace-local — force the scope when switching to one.
      ...(nextIsCustom ? { location: 'LocalWorkspace' as const } : {}),
    });
  }}>
  {OBJECT_OPTIONS.map((option) => (
    <option key={option.value} value={option.value}>{option.label}</option>
  ))}
  {customObjectOptions.length > 0 && (
    <optgroup label="Custom objects">
      {customObjectOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </optgroup>
  )}
</select>
```

- Lock the Location control when `isCustomObject`:

```tsx
<select className="mws-select" aria-label="Location" value={form.location} disabled={isCustomObject}
  onChange={(event) => patch({ location: event.target.value as FieldForm['location'] })}>
  {FIELD_LOCATION_OPTIONS.map((option) => (
    <option key={option.value} value={option.value}>{option.label}</option>
  ))}
</select>
{isCustomObject && <span className="caption">Custom-object fields are workspace-local.</span>}
```

- The `fieldTypeOptions` line stays `form.object === 'Task' ? TASK… : FIELD…` — custom objects fall through to the full `FIELD_TYPE_OPTIONS`, which is correct.

- [ ] **Step 6: Thread the prop through `FieldEditLoader` and `FieldsCatalogTab`**

`FieldEditLoader.tsx`: add `customObjectOptions` to its props (type `readonly { value: string; label: string }[]`), widen `objectType` to `FieldObjectTypeOrSlug`, and forward `customObjectOptions` to `FieldEditorSheet`.

`FieldsCatalogTab.tsx`:
- `import { useWorkspaceObjects } from '@/features/objects';`
- `const objects = useWorkspaceObjects(workspaceId);`
- Build the options once:

```tsx
const customObjectOptions = useMemo(
  () => (objects.data ?? [])
    .filter((object) => !object.isSystem)
    .map((object) => ({ value: object.objectKey, label: object.name })),
  [objects.data],
);
```

- Pass `customObjectOptions={customObjectOptions}` to both the create `<FieldEditorSheet>` and the `<FieldEditLoader>`.

- [ ] **Step 7: Extend `FieldsCatalogTab.test.tsx`**

Add a test that mocks `useWorkspaceObjects` to return one non-system object and asserts that opening "New field" shows the custom object in the Object dropdown. Mock the hook at the module boundary (follow how the file already mocks `useFieldCatalog`/`useFields`). Include a jest-axe assertion on the open-editor state.

- [ ] **Step 8: Run all fields tests**

Run: `npm test -- fields` (from `web/`)
Expected: PASS. Then `npx tsc --noEmit` — no new errors.

- [ ] **Step 9: Commit**

```bash
git add shared/types/fields.ts web/src/features/fields/
git commit -m "feat(sp3): custom objects selectable in the Fields editor (Location locked to workspace)"
```

---

## Task 5: Rename the "Global" field-location label to "Platform" (+ tests)

Display-label only. The stored value stays `'Global'`. Change only user-facing strings for **field** location; leave the `FieldLocation` type, DTOs, DB, and **object**-location labels untouched.

**Files:**
- Modify: `web/src/features/fields/constants.ts` (`FIELD_LOCATION_OPTIONS` label)
- Modify: any field-location render site printing the literal "Global" (enumerate via grep)
- Test: `web/src/features/fields/constants.test.ts` (add/extend)

**Interfaces:**
- Consumes: nothing new. Independent of Tasks 1–4.
- Produces: `fieldLocationLabel('Global') === 'Platform'`; the value `'Global'` is unchanged everywhere.

- [ ] **Step 1: Enumerate the render sites**

Run (from repo root):

```bash
grep -rn "Global" web/src/features/fields/ --include=*.ts --include=*.tsx | grep -viE "test|// |ObjectLocation"
grep -rn "fieldLocationLabel" web/src/features/fields/
```

Confirm the only **field-location display** producer is `FIELD_LOCATION_OPTIONS` (in `constants.ts`) consumed by `fieldLocationLabel` and the editor's Location `<select>`. The catalog table and read-only sheet render the location via `fieldLocationLabel` (verify by grepping `FieldCatalogTable.tsx` / `FieldReadOnlySheet.tsx`); if either prints the raw value, route it through `fieldLocationLabel`. Do **not** touch `PlatformObjectsTab.tsx`'s own `locationLabel` (that's object location, out of scope).

- [ ] **Step 2: Write the failing test**

In `web/src/features/fields/constants.test.ts`:

```ts
import { fieldLocationLabel, FIELD_LOCATION_OPTIONS } from './constants';

describe('fieldLocationLabel', () => {
  it('fieldLocationLabel — Global value — reads "Platform"', () => {
    // Assert — display label renamed, stored value unchanged
    expect(fieldLocationLabel('Global')).toBe('Platform');
    expect(FIELD_LOCATION_OPTIONS.find((option) => option.value === 'Global')?.label).toBe('Platform');
  });

  it('fieldLocationLabel — LocalWorkspace value — unchanged', () => {
    expect(fieldLocationLabel('LocalWorkspace')).toBe('Local Workspace');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- fields/constants` (from `web/`)
Expected: FAIL — label is still "Global".

- [ ] **Step 4: Apply the rename**

In `constants.ts`, change the option label (value stays `'Global'`):

```ts
export const FIELD_LOCATION_OPTIONS: readonly { value: FieldLocation; label: string }[] = [
  { value: 'LocalWorkspace', label: 'Local Workspace' },
  { value: 'Global', label: 'Platform' },
];
```

Update the adjacent comment to note "Platform (stored value 'Global') = available to every workspace." If Step 1 found any site printing the raw `'Global'` string, route it through `fieldLocationLabel`.

- [ ] **Step 5: Run to verify pass + fix any snapshot/text assertions**

Run: `npm test -- fields` (from `web/`)
Expected: PASS. If an existing test asserted the visible text "Global" for a field location, update it to "Platform" (search test files for `'Global'` as display text — not as a value).

- [ ] **Step 6: Commit**

```bash
git add web/src/features/fields/constants.ts web/src/features/fields/constants.test.ts
git commit -m "feat(sp3): rename field-location label Global -> Platform (display only; stored value unchanged)"
```

---

## Slice completion

After all five tasks, run the project's slice-completion gate from the worktree:

- `npm test` + `npx tsc --noEmit` + `npm run lint` (web) — all green; coverage floor holds.
- `dotnet test api/Api.Tests/Api.Tests.csproj` — green.
- tSQLt runs in CI (can't run locally) — confirm the new test file is syntactically consistent with the repo's tSQLt style.
- Design gates trigger (Task 4/5 touch `.tsx`/`.ts`, not `.css`/`.scss`): follow the project's design-fidelity waiver ceremony (APP/SHELL rendered from the running dev servers if no shell/global/token/layout file changed — git-diff-verify; all prototyped screens `not-implemented`). See the project ship-gotchas.
- Then `/dev-review-and-remediate` → `/dev-ship`.

## Self-review (against the spec)

- **Spec Part 1 (editor selectable)** → Task 4. ✅
- **Spec Part 2 (typing boundary)** → Task 4 Steps 1–2 (`FieldObjectTypeOrSlug`). ✅
- **Spec Part 3 (three C# guards)** → Task 3 (create/update/retire + shared resolver). ✅
- **Spec Part 3b (proc widths + FieldRuleDependency migration)** → Task 1 (migration 088) + Task 2 (six procs + tSQLt). ✅
- **Spec Part 4 (Global→Platform rename)** → Task 5. ✅
- **Testing** — editor + axe (Task 4), backend branches (Task 3), tSQLt round-trip incl. rule (Task 2), rename check (Task 5), catalog-row-as-editable-User is already covered by the existing `FieldCatalogBuilderTests` (verify, don't duplicate). ✅
- **Type consistency:** `FieldObjectTypeOrSlug` defined in `shared/types/fields.ts` (Task 4 S1) and consumed in `fieldForm.ts`/`api.ts`/`useFields.ts`/`FieldEditorSheet.tsx`/`FieldEditLoader.tsx` (same names). `customObjectOptions: readonly { value: string; label: string }[]` is the same shape in `FieldsCatalogTab` → `FieldEditLoader` → `FieldEditorSheet`. `ResolveObjectTypeAsync`/`ObjectResolution` names consistent across the three handlers. ✅
