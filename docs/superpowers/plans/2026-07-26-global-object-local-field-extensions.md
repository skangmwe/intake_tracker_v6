# Per-workspace Local Field Extensions on Global Objects (SP3b Slice 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a workspace admin safely add their own `LocalWorkspace` fields to a platform-owned Global custom object, by closing the one correctness hole (a workspace-local key colliding with a platform Global key on the same object) and proving the already-wired path with tests.

**Architecture:** The authoring gate, catalog, records query, and web affordance are already wired (traced in the shipped 2a code — see the design doc). The single real change is a **symmetric cross-namespace collision guard** in `usp_UpsertFieldDefinition` (the one proc both authoring paths share): a `THROW 50011` when a `(ObjectType, FieldKey)` would exist as both a platform Global field (`WorkspaceId NULL, Location='Global'`) and a workspace-local field (`WorkspaceId=<ws>`). The two service upsert methods map `SqlException 50011 → FieldOperationOutcome.Conflict`; both controllers already map `Conflict → 409`. Everything else is verification + tests.

**Tech Stack:** SQL Server stored procedures + tSQLt; ASP.NET Core / EF Core (`ExecuteSqlRawAsync`) + xUnit/Moq; React + Jest + jest-axe.

## Global Constraints

- **No schema migration.** The guard is a `CREATE OR ALTER PROCEDURE` body change (procs re-apply on every deploy). No new migration number, no new table/column/index.
- **The guard is symmetric and uses error number `50011`** (`50010` is already taken by the platform-defined guard). Both directions throw `50011`.
- **The guard runs AFTER `@FieldDefinitionId` is resolved** (after the existing `THROW 50010` check, before the `IF @FieldDefinitionId IS NULL` insert/update branch), so a legitimate re-save never trips the opposite-namespace check.
- **The guard is inherently scoped to Global custom objects** — `WorkspaceId IS NULL` FieldDefinition rows exist only for them; on built-in Request/Task a workspace-authored Global field is `WorkspaceId=<ws>, Location='Global'`, never `WorkspaceId NULL`. The built-in "Platform-location" feature must keep working (regression test).
- **tSQLt runs in CI only** (cannot run locally in this environment). Its red/green happens at slice-completion via `/dev-review-and-remediate`. xUnit and Jest run locally.
- **Tests ship in this slice** — never deferred.
- Follow `.claude/rules/dev/database-stored-procedures.md`, `database-testing.md`, `api-coding-standards.md`, `api-error-handling.md`, `web-testing.md`.

---

## Task 1: Symmetric collision guard in `usp_UpsertFieldDefinition` + tSQLt

**Files:**
- Modify: `database/procedures/fields/usp_UpsertFieldDefinition.sql` (add the guard after line 95; extend the header comment)
- Create: `database/tests/fields/test_usp_UpsertFieldDefinition_GlobalLocalCollision.sql`

**Interfaces:**
- Consumes: existing `dbo.usp_UpsertFieldDefinition` signature (unchanged) — `@WorkspaceId UNIQUEIDENTIFIER` (nullable since migration 101), `@ObjectType`, `@FieldKey`, `@Location`, `@Category`, `@DisplayName`, `@FieldType`, `@ActorUserId`, rest defaulted.
- Produces: `THROW 50011` on a cross-namespace `(ObjectType, FieldKey)` collision — consumed by Task 2's `SqlException.Number == 50011` catch.

- [ ] **Step 1: Write the failing tSQLt tests**

Create `database/tests/fields/test_usp_UpsertFieldDefinition_GlobalLocalCollision.sql`:

```sql
-- =============================================
-- Author:      SP3b Slice 2b — per-workspace local field extensions on Global objects
-- Description: The symmetric cross-namespace collision guard in usp_UpsertFieldDefinition. On a
--              Global custom object, dbo.CustomRecords.FieldValues is keyed by FieldKey, so a
--              platform-owned Global field (WorkspaceId NULL) and a workspace-local field
--              (WorkspaceId=<ws>) must never share (ObjectType, FieldKey). Both authoring paths
--              hit this one proc; the guard THROWs 50011 in either direction. It is a no-op on
--              built-in objects, where no WorkspaceId-NULL rows exist.
-- =============================================
EXEC tSQLt.NewTestClass 'FieldsGlobalLocalCollisionTests';
GO

CREATE PROCEDURE FieldsGlobalLocalCollisionTests.[test workspace-local field colliding with a platform Global field throws 50011]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'vendorreview';
    -- A platform-owned Global field already exists on the object (WorkspaceId NULL, Location='Global').
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, Location, IsDeleted)
    VALUES (NEWID(), NULL, @Slug, N'Priority', N'Global', 0);

    -- Act / Assert — a workspace creating a LOCAL field with the same key is rejected (50011).
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50011;
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'Priority',
        @DisplayName = N'Priority', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';
END;
GO

CREATE PROCEDURE FieldsGlobalLocalCollisionTests.[test platform Global field colliding with a workspace-local field throws 50011]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'vendorreview';
    -- A workspace already owns a LOCAL field with this key on the object.
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, Location, IsDeleted)
    VALUES (NEWID(), @Ws, @Slug, N'Priority', N'LocalWorkspace', 0);

    -- Act / Assert — a platform admin (WorkspaceId NULL) creating a Global field of the same key is rejected.
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50011;
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = @Slug, @FieldKey = N'Priority',
        @DisplayName = N'Priority', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'platform';
END;
GO

CREATE PROCEDURE FieldsGlobalLocalCollisionTests.[test workspace-local field with a different key coexists and re-saves without tripping the guard]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'vendorreview';
    -- A platform Global field 'Priority' exists; the workspace adds a DIFFERENT local key.
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, Location, IsDeleted)
    VALUES (NEWID(), NULL, @Slug, N'Priority', N'Global', 0);

    -- Act — create then re-save the local field (different key → no collision, and the re-save
    -- matches only its own namespace row so the guard stays a no-op).
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'InternalOwner',
        @DisplayName = N'Internal Owner', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'InternalOwner',
        @DisplayName = N'Internal Owner (edited)', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';

    -- Assert — exactly one live local row for that key, carrying the edited name.
    DECLARE @Name NVARCHAR(200) =
        (SELECT DisplayName FROM dbo.FieldDefinition
         WHERE WorkspaceId = @Ws AND ObjectType = @Slug AND FieldKey = N'InternalOwner' AND IsDeleted = 0);
    EXEC tSQLt.AssertEqualsString @Expected = N'Internal Owner (edited)', @Actual = @Name;
END;
GO

CREATE PROCEDURE FieldsGlobalLocalCollisionTests.[test workspace-authored Global field on a built-in object still upserts (guard is a no-op on built-ins)]
AS
BEGIN
    -- Arrange — empty FieldDefinition; no WorkspaceId-NULL rows exist on built-ins.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';

    -- Act — a workspace authors a Global field on the Request built-in (the "Platform-location" feature).
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'FirmWide',
        @DisplayName = N'Firm Wide', @FieldType = N'ShortText', @Category = N'Global',
        @Location = N'Global', @ActorUserId = N'tester';

    -- Assert — the row was written (the workspace-side guard found no WorkspaceId-NULL row to collide with).
    DECLARE @Count INT =
        (SELECT COUNT(*) FROM dbo.FieldDefinition
         WHERE WorkspaceId = @Ws AND ObjectType = N'Request' AND FieldKey = N'FirmWide' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO
```

- [ ] **Step 2: (CI) Confirm the new tests fail against the un-guarded proc**

tSQLt cannot run locally in this environment — its red/green runs in CI at slice-completion via `/dev-review-and-remediate`. Before the guard exists, `[…throws 50011]` cases FAIL (no exception raised); the coexist and built-in cases PASS. Record this expectation; do not block on a local run.

- [ ] **Step 3: Add the guard to the proc**

In `database/procedures/fields/usp_UpsertFieldDefinition.sql`, immediately AFTER the existing platform-defined check (the `IF @IsPlatformDefined = 1 THROW 50010, …` block, ~line 95) and BEFORE `IF @FieldDefinitionId IS NULL`, insert:

```sql
        -- SP3b Slice 2b — symmetric cross-namespace collision guard. On a Global custom object the
        -- CustomRecords.FieldValues JSON is keyed by FieldKey, so a platform-owned Global field
        -- (WorkspaceId NULL, Location='Global') and a workspace-local field (WorkspaceId=<ws>,
        -- Location='LocalWorkspace') must never share (ObjectType, FieldKey). No filtered unique
        -- index can express this (they partition on Location='Global' vs WorkspaceId IS NOT NULL),
        -- so it is enforced here. Runs AFTER @FieldDefinitionId is resolved so a legitimate re-save
        -- of the field itself (which matched only its own namespace's row above) never trips its
        -- opposite-namespace check. Inherently scoped to Global custom objects: WorkspaceId-NULL
        -- FieldDefinition rows exist only for them (migration 101), so the workspace-side check is a
        -- no-op on built-ins (whose workspace-authored Global fields are WorkspaceId=<ws>,
        -- Location='Global', never WorkspaceId NULL — the "Platform-location" feature is unaffected).
        IF @WorkspaceIdLocal IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.FieldDefinition
                       WHERE WorkspaceId IS NULL AND Location = N'Global'
                         AND ObjectType = @ObjectTypeLocal AND FieldKey = @FieldKeyLocal AND IsDeleted = 0)
            THROW 50011, 'A field with this key already exists on this object as a platform-defined field. Choose a different key.', 1;

        IF @WorkspaceIdLocal IS NULL
           AND EXISTS (SELECT 1 FROM dbo.FieldDefinition
                       WHERE WorkspaceId IS NOT NULL
                         AND ObjectType = @ObjectTypeLocal AND FieldKey = @FieldKeyLocal AND IsDeleted = 0)
            THROW 50011, 'A field with this key already exists on this object as a workspace field. Choose a different key.', 1;
```

Also add one line to the proc's header comment block (after the Slice 2a note), e.g.:

```sql
--              Updated 2026-07-26 (SP3b Slice 2b) — symmetric cross-namespace collision guard
--              (THROW 50011): a platform-owned Global field and a workspace-local field on the same
--              Global custom object may never share (ObjectType, FieldKey). No-op on built-ins.
```

- [ ] **Step 4: (CI) Confirm all four tests pass with the guard in place**

At slice-completion in CI, all four `FieldsGlobalLocalCollisionTests` cases PASS: both `[…throws 50011]` raise 50011; the coexist re-save and the built-in cases succeed.

- [ ] **Step 5: Commit**

```bash
git add database/procedures/fields/usp_UpsertFieldDefinition.sql database/tests/fields/test_usp_UpsertFieldDefinition_GlobalLocalCollision.sql
git commit -m "feat(sp3b): symmetric Global/local field-key collision guard (Slice 2b)"
```

---

## Task 2: Map `SqlException 50011 → Conflict` in both service upsert paths

**Files:**
- Modify: `api/Api/Modules/Fields/FieldSchemaService.cs` (add a const; wrap the two `ExecuteUpsertAsync` calls; extend the class doc-comment)

**Interfaces:**
- Consumes: `THROW 50011` from Task 1 (surfaces as `Microsoft.Data.SqlClient.SqlException` with `Number == 50011` from `ExecuteSqlRawAsync`). `Microsoft.Data.SqlClient` is already imported in this file.
- Produces: `FieldOperationResult(FieldOperationOutcome.Conflict)` — both controllers already map it to 409 (`FieldsController.MapUpsert`; `PlatformSchemaController.FieldConflictProblem`).

**Why both methods, and why no new fake-context unit test:** The workspace path (`UpsertFieldAsync`) normally returns `Conflict` from its union pre-check before the proc runs — but under a concurrency race (a platform Global field created between the pre-check read and the proc call) the proc `THROW 50011` is genuinely reachable, so the catch is load-bearing, not dead code. The platform path (`UpsertGlobalObjectFieldAsync`) has no cross-namespace pre-check, so its catch is the primary guard surface. Neither catch is unit-testable with a fake `DbContext` (a real proc `THROW` is required and `SqlException` has no public constructor) — this is the same constraint `FieldSchemaServiceGlobalFieldTests` documents for the Conflict/Success DB branches. Coverage is: Task 1's tSQLt (proc throws 50011) + the existing controller `Conflict → 409` unit tests (`PlatformSchemaControllerTests.CreateField_DuplicateKey_Returns409`; `FieldsControllerTests` duplicate-field 409) + the authenticated LocalDB round-trip run at slice-completion.

- [ ] **Step 1: Add the error-number constant**

In `api/Api/Modules/Fields/FieldSchemaService.cs`, inside the `FieldSchemaService` class near the top (beside the other private fields/consts), add:

```csharp
    // usp_UpsertFieldDefinition raises this when a platform-owned Global field and a workspace-local
    // field on the same Global custom object would share (ObjectType, FieldKey) — see SP3b Slice 2b.
    private const int GlobalLocalKeyCollisionError = 50011;
```

- [ ] **Step 2: Wrap the workspace upsert call**

In `UpsertFieldAsync`, replace the single line:

```csharp
        await ExecuteUpsertAsync(workspaceId, request, dependencies, actorUserId, cancellationToken).ConfigureAwait(false);
```

with:

```csharp
        try
        {
            await ExecuteUpsertAsync(workspaceId, request, dependencies, actorUserId, cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == GlobalLocalKeyCollisionError)
        {
            // A platform-owned Global field with this key was created between the union pre-check
            // above and this write (concurrency race) — surface it as a Conflict, not a 500.
            return new FieldOperationResult(FieldOperationOutcome.Conflict);
        }
```

- [ ] **Step 3: Wrap the platform upsert call**

In `UpsertGlobalObjectFieldAsync`, replace the single line:

```csharp
        await ExecuteUpsertAsync(null, request, dependencies, actorUserId, cancellationToken).ConfigureAwait(false);
```

with:

```csharp
        try
        {
            await ExecuteUpsertAsync(null, request, dependencies, actorUserId, cancellationToken).ConfigureAwait(false);
        }
        catch (SqlException ex) when (ex.Number == GlobalLocalKeyCollisionError)
        {
            // A workspace already uses this key locally on this Global object — reject the platform
            // field as a Conflict (there is no cross-namespace pre-check on this path).
            return new FieldOperationResult(FieldOperationOutcome.Conflict);
        }
```

- [ ] **Step 4: Extend the class doc-comment**

At the end of the file-top summary comment on `FieldSchemaService.cs`, add one sentence:

```
// SP3b Slice 2b: both upsert paths map usp_UpsertFieldDefinition's THROW 50011 (a Global/local
// field-key collision on a Global custom object) to a Conflict outcome (→ 409).
```

- [ ] **Step 5: Build and run the existing fields tests**

Run: `dotnet test api/Api.Tests/Api.Tests.csproj --filter "FullyQualifiedName~Field|FullyQualifiedName~PlatformSchema"`
Expected: PASS (the change compiles; existing controller `Conflict → 409` and service guard tests are unaffected).

- [ ] **Step 6: Commit**

```bash
git add api/Api/Modules/Fields/FieldSchemaService.cs
git commit -m "feat(sp3b): map field-key collision (50011) to 409 in both upsert paths (Slice 2b)"
```

---

## Task 3: Web verification — local field on a Global object is workspace-local and editable

**Files:**
- Modify: `web/src/features/fields/components/FieldObjectAndLocationFields.test.tsx` (add: selecting a custom object forces `LocalWorkspace` and disables Location)
- Modify: `web/src/features/fields/components/FieldsCatalogTab.test.tsx` (add: a Global custom object is offered as a New-field target)

**Interfaces:**
- Consumes: `FieldObjectAndLocationFields` (forces `location:'LocalWorkspace'` + disables the Location select for any custom object, incl. Global — component lines 51-58, 85); `FieldsCatalogTab`'s `customObjectOptions` (sourced from `useWorkspaceObjects`, which returns inherited-Global objects); test helpers `buildObjectDefinition`, `buildFieldCatalogRow`, `renderWithProviders` from `@/test-utils`.
- Produces: characterization tests locking in the 2b-visible behavior. No production code change expected; if a test fails, that is a real gap to fix in the named component.

These are characterization tests: the behavior already exists (a Global object is "just a custom object" to these components), so they should PASS on first run and guard against regression. The 409 collision message reuses the generic `saveError` path already covered by `FieldEditorSheet`'s error test (Step 5 verifies that coverage exists rather than duplicating it).

- [ ] **Step 1: Add the "custom object forces LocalWorkspace" test**

In `web/src/features/fields/components/FieldObjectAndLocationFields.test.tsx`, add inside the `describe` block (the existing `renderFields` helper and imports are already present; add `userEvent` to the imports):

```tsx
  it('FieldObjectAndLocationFields — selecting a custom object forces LocalWorkspace and disables Location', async () => {
    // Arrange — a Global custom object is offered like any other custom object.
    const user = userEvent.setup();
    const { props } = renderFields({
      customObjectOptions: [{ value: 'vendorReview', label: 'Vendor Review' }],
    });

    // Act — pick the custom object.
    await user.selectOptions(screen.getByLabelText('Object'), 'vendorReview');

    // Assert — the form is patched to the workspace-local scope, and Location is locked.
    expect(props.onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ object: 'vendorReview', location: 'LocalWorkspace' }),
    );
  });

  it('FieldObjectAndLocationFields — a custom-object form disables the Location select', () => {
    // Arrange / Act — a form already scoped to a custom object.
    renderFields({
      form: { ...buildInitialForm(null, 'vendorReview', FIELD_TYPE_OPTIONS), location: 'LocalWorkspace' },
      customObjectOptions: [{ value: 'vendorReview', label: 'Vendor Review' }],
    });

    // Assert
    expect(screen.getByLabelText('Location')).toBeDisabled();
  });
```

Add the imports at the top of the file if missing:

```tsx
import userEvent from '@testing-library/user-event';
import { buildInitialForm } from '../fieldForm';
```

- [ ] **Step 2: Run the FieldObjectAndLocationFields test**

Run: `cd web && npx jest src/features/fields/components/FieldObjectAndLocationFields.test.tsx`
Expected: PASS (behavior exists in the component). If FAIL, fix the component to force `LocalWorkspace` / disable Location for custom objects.

- [ ] **Step 3: Add the "Global custom object as a New-field target" test**

In `web/src/features/fields/components/FieldsCatalogTab.test.tsx`, add inside the `describe` block (mirrors the existing custom-object dropdown test but uses a **Global** object — `location:'Global'`, `isSystem:false`):

```tsx
  it('FieldsCatalogTab — a Global custom object is offered as a New-field target', async () => {
    // Arrange — a platform-owned Global custom object is inherited into the workspace.
    mockedUseWorkspaceObjects.mockReturnValue({
      data: [
        buildObjectDefinition({
          objectKey: 'vendorReview',
          name: 'Vendor Review',
          isSystem: false,
          location: 'Global',
        }),
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useWorkspaceObjects>);
    const user = userEvent.setup();
    const { container } = renderWithProviders(<FieldsCatalogTab workspaceId={WS} />);
    await screen.findByRole('table');

    // Act — open the create editor.
    await user.click(screen.getByRole('button', { name: /new field/i }));

    // Assert — the Global object appears as a selectable field target (a workspace admin can add a
    // LocalWorkspace field to it); the editor is accessible.
    const dialog = await screen.findByRole('dialog', { name: 'Add field' });
    expect(await screen.findByRole('option', { name: 'Vendor Review' })).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
```

- [ ] **Step 4: Run the FieldsCatalogTab test**

Run: `cd web && npx jest src/features/fields/components/FieldsCatalogTab.test.tsx`
Expected: PASS. If `buildObjectDefinition` does not accept a `location` field, check its signature in `web/src/test-utils` and pass the correct property (a Global object needs `isSystem: false`; the `location` value only affects the object row, not whether it is offered — the picker filters on `!isSystem`).

- [ ] **Step 5: Confirm the 409 collision message reuses existing save-error coverage**

The collision surfaces via `saveError` (from `problemMessage(saveField.error)`) passed into `FieldEditorSheet` / `FieldEditLoader` — the same path any save error uses; it is not 2b-specific.

Run: `cd web && npx jest src/features/fields/components/FieldEditorSheet.test.tsx -t saveError`
Expected: an existing test renders `saveError`. If none exists, add one to `FieldEditorSheet.test.tsx` asserting a passed `saveError` string renders in an alert; otherwise no new test is needed.

- [ ] **Step 6: Commit**

```bash
git add web/src/features/fields/components/FieldObjectAndLocationFields.test.tsx web/src/features/fields/components/FieldsCatalogTab.test.tsx
git commit -m "test(sp3b): workspace can add local fields to a Global object (Slice 2b)"
```

---

## Self-Review (completed)

- **Spec coverage:** Guard (symmetric, both directions) → Task 1 (proc) + Task 2 (service map). Store/query/read of a local field on a Global object → already wired; Task 1's coexist test + existing 2a query-whitelist tests cover it. Web expose → Task 3. Records CSV IO → driven by `GetSchemaAsync` union (already returns both bands); no gap found, no task needed. "No migration" honored. Built-in "Platform-location" regression → Task 1 case 4.
- **Placeholder scan:** none — every step carries concrete SQL/C#/TSX.
- **Type/name consistency:** `THROW 50011` (Task 1) ↔ `GlobalLocalKeyCollisionError = 50011` + `SqlException.Number == 50011` (Task 2) ↔ `FieldOperationOutcome.Conflict` → `409` (existing controllers). `FieldsGlobalLocalCollisionTests` test-class name used once. Web helpers (`buildObjectDefinition`, `buildFieldCatalogRow`, `renderWithProviders`, `useWorkspaceObjects` mock) match the existing test file usage.
```
