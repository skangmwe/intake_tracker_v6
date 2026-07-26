# Custom-Object Import Upsert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Create or update" (upsert) mode to custom-object CSV import — a row whose **Record ID** matches an existing record updates it (merging), a row with no id creates one — and report created / updated / flagged counts.

**Architecture:** Extends SP5's create-only import. Upsert matches on the record id only; the merge is done in C# (load the record via `GetByIdAsync`, overlay the CSV's mapped fields, `PatchAsync` the merged map) — no record-side proc. A `Create | Upsert` mode threads form → service → job message → the descriptor; the descriptor branches. Created/updated counts add two columns to the import record (the one migration). Custom objects only.

**Tech Stack:** ASP.NET Core, EF Core (stored procs via `FromSqlRaw`/`ExecuteSqlRaw`), Azure SQL + tSQLt, xUnit + Moq, React 19 + TypeScript (Jest + jest-axe).

**Spec:** `docs/superpowers/specs/2026-07-25-custom-object-import-upsert-design.md` (approved).

## Global Constraints

- **Migration number:** the spec says `097`. At build start, run `ls database/migrations/ | tail` on the freshly-reset `origin/dev` and use the next free number; if `097` is taken (concurrent shipping), renumber the file + its `MigrationId` literal + rollback. Do NOT trust this doc's number blindly.
- **No record-side proc / no `dbo.CustomRecords` change.** The merge reuses `ICustomRecordsService.GetByIdAsync` + `PatchAsync`. The only schema change is `CreatedRows`/`UpdatedRows` on `dbo.Imports`.
- **Custom objects only.** Built-ins (Request/Feature/Task/Toolkit/Attachment) stay create-only: `CanUpsert => false`; the controller rejects `mode=upsert` on a non-`CanUpsert` object with 400.
- **Additive, default-preserving contract changes** so existing call sites keep compiling until the task that updates them: `ImportRowContext` gains `Mode = ImportMode.Create`; `ImportRowResult` gains `Action = ImportAction.None` (4th param); `ImportJobMessage` gains `Mode = ImportMode.Create`.
- **`id` is never written as data** (SP5's `_userFieldKeys` already excludes it). In upsert it is a match key only.
- Every async method accepts and passes a `CancellationToken`. Field/CSV values are Confidential — never logged (api-pii-handling.md). All errors are ProblemDetails.
- **Test projects:** `api/Api.Tests` (flat, namespace `McDermott.AiTracker.Api.Tests`); tSQLt in `database/tests/`; web tests colocated.
- **Commits:** bare `git commit` is hook-blocked — use `git -C <worktree> commit …`. Build with per-task commits; ship via manual `--no-ff` merge.
- **tSQLt runs in CI only** (not locally); author to FakeTable/AAA, verify via a LocalDB smoke if possible. `npx tsc --noEmit` is the only mid-slice web gate.

---

## File Structure

**DB (Task 1):**
- New migration `database/migrations/<NNN>_AlterImports_AddUpsertCounts.sql` (+ `_Rollback.sql`) — two columns on `dbo.Imports`.
- Modify `database/procedures/imports/usp_CompleteImport.sql`, `usp_GetImportById.sql`.
- New tSQLt `database/tests/<...>usp_CompleteImport…` (or extend an existing import test class).
- Modify `api/Api/Data/Entities.cs` (`ImportJobRow` +2 fields).

**API contracts (Task 2):**
- Modify `api/Api/Modules/ImportExport/IoObjectRegistry.cs` (enums, `IIoObject.CanUpsert`, `ImportRowContext.Mode`, `ImportRowResult.Action`).
- Modify the five built-in descriptors (`RequestIoObject.cs`, `FeatureIoObject.cs`, `TaskIoObject.cs`, `ToolkitIoObject.cs`, `AttachmentIoObject.cs`) — `CanUpsert => false`.
- Modify `ImportExportDtos.cs` (`IoObjectDto.CanUpsert`, `ImportStatusResponse` +2), `ImportExportController.cs` (`ToDto`).

**API descriptor (Task 3):** Modify `CustomObjectIoObject.cs`.

**API threading (Task 4):** Modify `ImportQueue.cs`, `ImportService.cs`, `ImportRunner.cs`, `ImportExportController.cs`.

**Web (Tasks 5–6):** Modify `shared/types/imports.ts`, `web/src/features/import-export/api.ts`, `useImportExport.ts`, `components/ImportWizard.tsx`, `components/ImportRunStep.tsx`, and add tests.

---

### Task 1: Import-record upsert counts (DB + entity)

Add `CreatedRows` / `UpdatedRows` to `dbo.Imports`, write them from `usp_CompleteImport`, read them in `usp_GetImportById`, and surface them on the `ImportJobRow` projection.

**Files:**
- Create: `database/migrations/<NNN>_AlterImports_AddUpsertCounts.sql` + `_Rollback.sql`
- Modify: `database/procedures/imports/usp_CompleteImport.sql`, `database/procedures/imports/usp_GetImportById.sql`, `api/Api/Data/Entities.cs`
- Test: `database/tests/` tSQLt for `usp_CompleteImport`

**Interfaces:**
- Produces: `dbo.Imports.CreatedRows INT NOT NULL DEFAULT 0`, `.UpdatedRows INT NOT NULL DEFAULT 0`; `usp_CompleteImport` gains `@CreatedRows INT, @UpdatedRows INT`; `usp_GetImportById` SELECT gains `i.CreatedRows, i.UpdatedRows`; `ImportJobRow.CreatedRows`/`.UpdatedRows` (int).

- [ ] **Step 1: Write the migration**

Create `database/migrations/<NNN>_AlterImports_AddUpsertCounts.sql` (use the verified next number; `<NNN>` also in the `MigrationId`):

```sql
-- =============================================
-- Author:      import-upsert
-- Create Date: 2026-07-25
-- Description: Adds CreatedRows / UpdatedRows to dbo.Imports so an upsert import can report how many
--              records were created vs updated (custom-object import upsert). Backfills as 0 (existing
--              create-only imports = all created). Idempotent per database-migrations.md.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Imports', N'CreatedRows') IS NULL
    ALTER TABLE dbo.Imports ADD CreatedRows INT NOT NULL CONSTRAINT DF_Imports_CreatedRows DEFAULT 0;
GO
IF COL_LENGTH(N'dbo.Imports', N'UpdatedRows') IS NULL
    ALTER TABLE dbo.Imports ADD UpdatedRows INT NOT NULL CONSTRAINT DF_Imports_UpdatedRows DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'<NNN>_AlterImports_AddUpsertCounts')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'<NNN>_AlterImports_AddUpsertCounts', SUSER_SNAME(), N'Import upsert — CreatedRows/UpdatedRows on dbo.Imports.');
GO
```

Rollback `_Rollback.sql`:

```sql
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Imports', N'UpdatedRows') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Imports DROP CONSTRAINT DF_Imports_UpdatedRows;
    ALTER TABLE dbo.Imports DROP COLUMN UpdatedRows;
END;
GO
IF COL_LENGTH(N'dbo.Imports', N'CreatedRows') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Imports DROP CONSTRAINT DF_Imports_CreatedRows;
    ALTER TABLE dbo.Imports DROP COLUMN CreatedRows;
END;
GO
DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'<NNN>_AlterImports_AddUpsertCounts';
GO
```

- [ ] **Step 2: Update `usp_CompleteImport`**

In `database/procedures/imports/usp_CompleteImport.sql`, add the two params (after `@FlaggedRows`) and set the columns. Copy params into locals (parameter-sniffing discipline) and add to the `UPDATE`:

```sql
CREATE OR ALTER PROCEDURE dbo.usp_CompleteImport
    @ImportId    UNIQUEIDENTIFIER,
    @Status      NVARCHAR(24),
    @TotalRows   INT,
    @LandedRows  INT,
    @FlaggedRows INT,
    @CreatedRows INT = 0,
    @UpdatedRows INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Import  UNIQUEIDENTIFIER = @ImportId;
    DECLARE @Result  NVARCHAR(24)     = @Status;
    DECLARE @Total   INT              = @TotalRows;
    DECLARE @Landed  INT              = @LandedRows;
    DECLARE @Flagged INT              = @FlaggedRows;
    DECLARE @Created INT              = @CreatedRows;
    DECLARE @Updated INT              = @UpdatedRows;

    UPDATE dbo.Imports
    SET Status      = @Result,
        TotalRows   = @Total,
        LandedRows  = @Landed,
        FlaggedRows = @Flagged,
        CreatedRows = @Created,
        UpdatedRows = @Updated,
        CompletedAt = SYSUTCDATETIME(),
        UpdatedAt   = SYSUTCDATETIME()
    WHERE ImportId = @Import
      AND IsDeleted = 0;
END;
GO
```

(Defaults `= 0` keep any not-yet-updated caller working.)

- [ ] **Step 3: Update `usp_GetImportById`**

In `database/procedures/imports/usp_GetImportById.sql`, add `i.CreatedRows,` and `i.UpdatedRows,` to the SELECT list (after `i.FlaggedRows,`).

- [ ] **Step 4: Update the `ImportJobRow` projection**

In `api/Api/Data/Entities.cs`, add to `ImportJobRow` (after `FlaggedRows`):

```csharp
    public int CreatedRows { get; set; }
    public int UpdatedRows { get; set; }
```

- [ ] **Step 5: Write/extend the tSQLt test**

Find the existing import proc test class (`grep -rln "usp_CompleteImport" database/tests`). Add a test that fakes `dbo.Imports`, inserts one Processing row, `EXEC dbo.usp_CompleteImport` with `@CreatedRows=3, @UpdatedRows=2`, and asserts the row's `CreatedRows`/`UpdatedRows` (and `Status`/`LandedRows`). tSQLt pattern (never inline `@Actual=(SELECT…)`):

```sql
CREATE PROCEDURE <testclass>.[test usp_CompleteImport writes created and updated counts]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.Imports';
    INSERT INTO dbo.Imports (ImportId, WorkspaceId, FileName, BlobPath, Status, StartedByUserId, CreatedBy, UpdatedBy)
        VALUES ('11111111-1111-4111-8111-111111111111', NEWID(), N'f.csv', N'p', N'Processing', NEWID(), N'u', N'u');

    EXEC dbo.usp_CompleteImport
        @ImportId = '11111111-1111-4111-8111-111111111111',
        @Status = N'Completed', @TotalRows = 5, @LandedRows = 5, @FlaggedRows = 0,
        @CreatedRows = 3, @UpdatedRows = 2;

    DECLARE @Created INT = (SELECT CreatedRows FROM dbo.Imports WHERE ImportId = '11111111-1111-4111-8111-111111111111');
    DECLARE @Updated INT = (SELECT UpdatedRows FROM dbo.Imports WHERE ImportId = '11111111-1111-4111-8111-111111111111');
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Created;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Updated;
END;
GO
```

(FakeTable strips the DEFAULT constraints — provide all NOT NULL columns in the INSERT.)

- [ ] **Step 6: Verify the build + commit**

Run: `dotnet build api/Api` (the entity change compiles). tSQLt is CI-only; if a LocalDB is available, apply the migration + proc and run the smoke, else note "tSQLt CI-only" in the report.

```bash
git -C <worktree> add database/migrations database/procedures/imports api/Api/Data/Entities.cs database/tests
git -C <worktree> commit -m "feat(upsert): CreatedRows/UpdatedRows on imports (migration + procs + entity)"
```

---

### Task 2: Import contracts — mode, action, CanUpsert (additive)

Add the two enums, the `Mode`/`Action` fields, the `CanUpsert` capability, and the two new `ImportStatusResponse` counts — all additive with defaults so nothing downstream breaks yet. Update existing tests that construct `IoObjectDto` / `ImportStatusResponse` for the new positional members.

**Files:**
- Modify: `api/Api/Modules/ImportExport/IoObjectRegistry.cs`, `RequestIoObject.cs`, `FeatureIoObject.cs`, `TaskIoObject.cs`, `ToolkitIoObject.cs`, `AttachmentIoObject.cs`, `ImportExportDtos.cs`, `ImportExportController.cs`
- Test: `api/Api.Tests/ImportExportControllerTests.cs`, `api/Api.Tests/ExportServiceTests.cs` (only if they construct `ImportStatusResponse`/`IoObjectDto` positionally — grep first)

**Interfaces:**
- Produces: `enum ImportMode { Create, Upsert }`; `enum ImportAction { None, Created, Updated }`; `IIoObject.CanUpsert` (bool); `ImportRowContext(..., ImportMode Mode = ImportMode.Create)`; `ImportRowResult(string Outcome, string? RecordId, IReadOnlyList<ImportReasonDto> Reasons, ImportAction Action = ImportAction.None)`; `IoObjectDto(..., bool CanUpsert, ...)`; `ImportStatusResponse(..., int CreatedRows, int UpdatedRows, ...)`.

- [ ] **Step 1: Add the enums + contract fields (in `IoObjectRegistry.cs`)**

Add near the top of the namespace:

```csharp
/// <summary>Whether an import run creates new records only, or matches by Record ID and updates
/// existing ones (create-or-update). Only objects with <see cref="IIoObject.CanUpsert"/> accept Upsert.</summary>
public enum ImportMode { Create, Upsert }

/// <summary>What an imported row did to the store — used for the created/updated report split. A
/// Flagged row is None.</summary>
public enum ImportAction { None, Created, Updated }
```

Add to `IIoObject` (after `CanExport`):

```csharp
    /// <summary>Whether this object supports upsert import (match an existing record by Record ID and
    /// update it). False for the built-ins (create-only); true for custom objects.</summary>
    bool CanUpsert { get; }
```

Change `ImportRowContext` to carry the mode:

```csharp
public sealed record ImportRowContext(
    Guid WorkspaceId, Guid ActorUserId, string ActorEmail, string OperationId,
    ImportMode Mode = ImportMode.Create);
```

Change `ImportRowResult` to carry the action (keep `Landed`/`Flagged` consts):

```csharp
public sealed record ImportRowResult(
    string Outcome, string? RecordId, IReadOnlyList<ImportReasonDto> Reasons,
    ImportAction Action = ImportAction.None)
{
    public const string Landed = "Landed";
    public const string Flagged = "Flagged";
}
```

- [ ] **Step 2: Built-in descriptors return `CanUpsert => false`**

In each of `RequestIoObject.cs`, `FeatureIoObject.cs`, `TaskIoObject.cs`, `ToolkitIoObject.cs`, `AttachmentIoObject.cs`, add next to the existing `CanImport`/`CanExport` properties:

```csharp
    public bool CanUpsert => false;
```

- [ ] **Step 3: DTO changes**

In `ImportExportDtos.cs`, add `CanUpsert` to `IoObjectDto` (after `CanExport`):

```csharp
public sealed record IoObjectDto(
    string ObjectType,
    string Label,
    bool CanImport,
    bool CanExport,
    bool CanUpsert,
    IReadOnlyList<IoFieldSpecDto> ImportFields,
    IReadOnlyList<IoFieldSpecDto> ExportFields);
```

And add the two counts to `ImportStatusResponse` (after `LandedRows`):

```csharp
public sealed record ImportStatusResponse(
    Guid Id,
    Guid WorkspaceId,
    Guid StartedBy,
    DateTime StartedAt,
    string Status,
    int TotalRows,
    int LandedRows,
    int CreatedRows,
    int UpdatedRows,
    IReadOnlyList<ImportFlaggedRowDto> FlaggedRows);
```

- [ ] **Step 4: `ToDto` in the controller passes `CanUpsert`**

In `ImportExportController.cs`, update `ToDto`:

```csharp
    private static IoObjectDto ToDto(IIoObject ioObject, IReadOnlyList<IoFieldSpec> exportFields) => new(
        ioObject.ObjectType,
        ioObject.Label,
        ioObject.CanImport,
        ioObject.CanExport,
        ioObject.CanUpsert,
        ioObject.ImportFields.Select(ToFieldDto).ToList(),
        exportFields.Select(ToFieldDto).ToList());
```

`ImportService.GetStatusAsync` also constructs `ImportStatusResponse` — Task 4 fills the two counts; for now pass `0, 0` there **or** leave for Task 4. To keep this task compiling, update `GetStatusAsync`'s construction to pass `job.CreatedRows, job.UpdatedRows` now (the entity fields exist from Task 1):

```csharp
        return new ImportStatusResponse(
            job.ImportId, job.WorkspaceId, job.StartedByUserId,
            DateTime.SpecifyKind(job.StartedAt, DateTimeKind.Utc),
            job.Status, job.TotalRows, job.LandedRows, job.CreatedRows, job.UpdatedRows, flagged);
```

- [ ] **Step 5: Fix existing tests that build these records positionally**

`grep -rn "new IoObjectDto(\|new ImportStatusResponse(\|Mock<IIoObject>" api/Api.Tests`. For every `Mock<IIoObject>` used as an export/import object, add `.SetupGet(o => o.CanUpsert).Returns(false)` if a test reads it (Moq returns false by default, so usually no change). For any literal `new IoObjectDto(...)` add the `canUpsert` arg; for any `new ImportStatusResponse(...)` add `createdRows, updatedRows`. (The controller/service tests from SP5 mock the service's `GetStatusAsync` return — update those literals.)

- [ ] **Step 6: Build + test + commit**

Run: `dotnet build api/Api` then `dotnet test api/Api.Tests` — all green (additive change).

```bash
git -C <worktree> add api/Api/Modules/ImportExport api/Api.Tests
git -C <worktree> commit -m "feat(upsert): import mode/action enums, CanUpsert, created/updated status contract"
```

---

### Task 3: `CustomObjectIoObject` upsert branch

`CanUpsert => true`; `ImportRowAsync` branches on `context.Mode`. Create mode is unchanged (now returns `Action = Created`). Upsert mode reads `fieldValues["id"]`: blank → create; bad GUID → flag; not found → flag; found → merge + `PatchAsync` → `Updated`.

**Files:**
- Modify: `api/Api/Modules/ImportExport/CustomObjectIoObject.cs`
- Test: `api/Api.Tests/CustomObjectIoObjectTests.cs`

**Interfaces:**
- Consumes: `ICustomRecordsService.GetByIdAsync(ws, objectId, recordId, ct) → Task<CustomRecordDto?>` (`.Fields` = `IReadOnlyDictionary<string,JsonElement>`, `.Name`); `.PatchAsync(ws, objectId, recordId, CustomRecordWriteRequest, actor, ct) → Task<CustomRecordWriteResult>`. `ImportMode`, `ImportAction` (Task 2).

- [ ] **Step 1: Write the failing tests**

Append to `CustomObjectIoObjectTests.cs` (reuse the existing `Build`, `ExportFields`, `ImportFields`, `Str`, `ObjectId`, `Slug` helpers):

```csharp
    private static ImportRowContext UpsertCtx(Guid ws) =>
        new(ws, Guid.NewGuid(), "admin@firm.com", "op", ImportMode.Upsert);

    [Fact]
    public async Task ImportRowAsync_Upsert_BlankId_CreatesRecord()
    {
        var ws = Guid.NewGuid();
        var records = new Mock<ICustomRecordsService>();
        records.Setup(s => s.CreateAsync(ws, ObjectId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.Success,
                new CustomRecordDto(Guid.NewGuid(), ObjectId, "Acme", new Dictionary<string, JsonElement>(), default, default, "u", "e")));
        var sut = Build(records);

        var result = await sut.ImportRowAsync(UpsertCtx(ws),
            new Dictionary<string, string?> { ["name"] = "Acme", ["vendorName"] = "Acme Inc" }, CancellationToken.None);

        Assert.Equal(ImportRowResult.Landed, result.Outcome);
        Assert.Equal(ImportAction.Created, result.Action);
        records.Verify(s => s.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ImportRowAsync_Upsert_FoundId_MergesAndUpdates()
    {
        var ws = Guid.NewGuid();
        var recordId = Guid.Parse("dddddddd-0000-4000-8000-000000000abc");
        var records = new Mock<ICustomRecordsService>();
        records.Setup(s => s.GetByIdAsync(ws, ObjectId, recordId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordDto(recordId, ObjectId, "Old name",
                new Dictionary<string, JsonElement> { ["vendorName"] = Str("Old vendor"), ["seatCount"] = Str("9") },
                default, default, "u", "e"));
        CustomRecordWriteRequest? patched = null;
        records.Setup(s => s.PatchAsync(ws, ObjectId, recordId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, Guid, Guid, CustomRecordWriteRequest, Guid, CancellationToken>((_, _, _, req, _, _) => patched = req)
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.Success,
                new CustomRecordDto(recordId, ObjectId, "New name", new Dictionary<string, JsonElement>(), default, default, "u", "e")));
        var sut = Build(records);

        // CSV maps id + name + vendorName (not seatCount) → seatCount preserved, vendorName overwritten, name updated.
        var result = await sut.ImportRowAsync(UpsertCtx(ws),
            new Dictionary<string, string?> { ["id"] = recordId.ToString(), ["name"] = "New name", ["vendorName"] = "New vendor" },
            CancellationToken.None);

        Assert.Equal(ImportRowResult.Landed, result.Outcome);
        Assert.Equal(ImportAction.Updated, result.Action);
        Assert.Equal("New name", patched!.Name);
        Assert.True(patched.Fields!.ContainsKey("seatCount"));   // preserved from existing
        Assert.True(patched.Fields!.ContainsKey("vendorName"));  // overwritten
        Assert.False(patched.Fields!.ContainsKey("id"));         // id never written as data
    }

    [Fact]
    public async Task ImportRowAsync_Upsert_FoundId_NoNameColumn_KeepsExistingName()
    {
        var ws = Guid.NewGuid();
        var recordId = Guid.Parse("dddddddd-0000-4000-8000-000000000def");
        var records = new Mock<ICustomRecordsService>();
        records.Setup(s => s.GetByIdAsync(ws, ObjectId, recordId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CustomRecordDto(recordId, ObjectId, "Keep me", new Dictionary<string, JsonElement>(), default, default, "u", "e"));
        CustomRecordWriteRequest? patched = null;
        records.Setup(s => s.PatchAsync(ws, ObjectId, recordId, It.IsAny<CustomRecordWriteRequest>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, Guid, Guid, CustomRecordWriteRequest, Guid, CancellationToken>((_, _, _, req, _, _) => patched = req)
            .ReturnsAsync(new CustomRecordWriteResult(CustomRecordWriteOutcome.Success,
                new CustomRecordDto(recordId, ObjectId, "Keep me", new Dictionary<string, JsonElement>(), default, default, "u", "e")));
        var sut = Build(records);

        await sut.ImportRowAsync(UpsertCtx(ws),
            new Dictionary<string, string?> { ["id"] = recordId.ToString(), ["vendorName"] = "x" }, CancellationToken.None);

        Assert.Equal("Keep me", patched!.Name); // no name column → existing name kept
    }

    [Fact]
    public async Task ImportRowAsync_Upsert_InvalidGuid_Flags()
    {
        var sut = Build(new Mock<ICustomRecordsService>());
        var result = await sut.ImportRowAsync(UpsertCtx(Guid.NewGuid()),
            new Dictionary<string, string?> { ["id"] = "not-a-guid", ["name"] = "x" }, CancellationToken.None);
        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Contains(result.Reasons, r => r.Code == "invalid-id");
    }

    [Fact]
    public async Task ImportRowAsync_Upsert_DeadId_Flags()
    {
        var ws = Guid.NewGuid();
        var recordId = Guid.Parse("dddddddd-0000-4000-8000-0000000000ff");
        var records = new Mock<ICustomRecordsService>();
        records.Setup(s => s.GetByIdAsync(ws, ObjectId, recordId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((CustomRecordDto?)null);
        var sut = Build(records);
        var result = await sut.ImportRowAsync(UpsertCtx(ws),
            new Dictionary<string, string?> { ["id"] = recordId.ToString(), ["name"] = "x" }, CancellationToken.None);
        Assert.Equal(ImportRowResult.Flagged, result.Outcome);
        Assert.Contains(result.Reasons, r => r.Code == "record-not-found");
    }
```

Also assert `sut.CanUpsert` is true in the existing `Metadata_*` test (add `Assert.True(sut.CanUpsert);`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test api/Api.Tests --filter FullyQualifiedName~CustomObjectIoObjectTests`
Expected: FAIL — `CanUpsert` and the upsert branch don't exist.

- [ ] **Step 3: Implement**

In `CustomObjectIoObject.cs`: add `public bool CanUpsert => true;` (next to `CanImport`/`CanExport`). Extract the mapped-fields/name build from the existing `ImportRowAsync` into a helper, and branch on mode. Replace the current `ImportRowAsync` body:

```csharp
    public async Task<ImportRowResult> ImportRowAsync(
        ImportRowContext context, IReadOnlyDictionary<string, string?> fieldValues, CancellationToken cancellationToken)
    {
        var (name, fields) = BuildWrite(fieldValues);

        if (context.Mode != ImportMode.Upsert)
        {
            return await CreateAsync(context, new CustomRecordWriteRequest(name, fields), cancellationToken).ConfigureAwait(false);
        }

        var rawId = fieldValues.TryGetValue("id", out var idCell) ? idCell?.Trim() : null;
        if (string.IsNullOrEmpty(rawId))
        {
            // No id → a brand-new row in an edited export → create.
            return await CreateAsync(context, new CustomRecordWriteRequest(name, fields), cancellationToken).ConfigureAwait(false);
        }

        if (!Guid.TryParse(rawId, out var recordId))
        {
            return new ImportRowResult(ImportRowResult.Flagged, null,
                new[] { new ImportReasonDto("invalid-id", "The Record ID isn't a valid id.", "id") });
        }

        var existing = await _records.GetByIdAsync(context.WorkspaceId, _objectDefinitionId, recordId, cancellationToken).ConfigureAwait(false);
        if (existing is null)
        {
            return new ImportRowResult(ImportRowResult.Flagged, null,
                new[] { new ImportReasonDto("record-not-found", "No record with that Record ID exists here.", "id") });
        }

        // Merge: existing fields, overlaid by the CSV's mapped fields; Name updated only if the CSV maps it.
        var merged = new Dictionary<string, JsonElement>(existing.Fields, StringComparer.Ordinal);
        foreach (var (key, value) in fields)
        {
            merged[key] = value;
        }

        var result = await _records
            .PatchAsync(context.WorkspaceId, _objectDefinitionId, recordId,
                new CustomRecordWriteRequest(name ?? existing.Name, merged), context.ActorUserId, cancellationToken)
            .ConfigureAwait(false);

        return result.Outcome switch
        {
            CustomRecordWriteOutcome.Success =>
                new ImportRowResult(ImportRowResult.Landed, result.Record!.Id.ToString(), Array.Empty<ImportReasonDto>(), ImportAction.Updated),
            CustomRecordWriteOutcome.ValidationFailed =>
                new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.FromValidationErrors(result.Errors!)),
            _ => new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.GenericFailure()),
        };
    }

    /// <summary>Build the record Name (mapped "name" cell, if any) and the field bag (mapped user-field
    /// cells as JSON strings; "id"/"name" and unknown keys dropped). Shared by create + upsert.</summary>
    private (string? Name, Dictionary<string, JsonElement> Fields) BuildWrite(IReadOnlyDictionary<string, string?> fieldValues)
    {
        string? name = null;
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var (key, rawValue) in fieldValues)
        {
            var value = rawValue?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                continue;
            }

            if (string.Equals(key, "name", StringComparison.Ordinal))
            {
                name = value;
            }
            else if (_userFieldKeys.Contains(key))
            {
                fields[key] = JsonSerializer.SerializeToElement(value, JsonOptions);
            }
        }

        return (name, fields);
    }

    /// <summary>Create-path (create-only import, and the blank-id upsert row).</summary>
    private async Task<ImportRowResult> CreateAsync(
        ImportRowContext context, CustomRecordWriteRequest request, CancellationToken cancellationToken)
    {
        var result = await _records
            .CreateAsync(context.WorkspaceId, _objectDefinitionId, request, context.ActorUserId, cancellationToken)
            .ConfigureAwait(false);

        return result.Outcome switch
        {
            CustomRecordWriteOutcome.Success =>
                new ImportRowResult(ImportRowResult.Landed, result.Record!.Id.ToString(), Array.Empty<ImportReasonDto>(), ImportAction.Created),
            CustomRecordWriteOutcome.ValidationFailed =>
                new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.FromValidationErrors(result.Errors!)),
            _ => new ImportRowResult(ImportRowResult.Flagged, null, ImportOutcomeMapper.GenericFailure()),
        };
    }
```

(This renames the create-path helper to `CreateAsync` on the descriptor — a private method; do not confuse with the service's `CreateAsync`. If a name clash reads awkwardly, call it `CreateRowAsync`. The existing SP5 create tests still pass because create returns `Landed` with `Action = Created`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test api/Api.Tests --filter FullyQualifiedName~CustomObjectIoObjectTests`
Expected: PASS (new upsert tests + all SP5 tests).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add api/Api/Modules/ImportExport/CustomObjectIoObject.cs api/Api.Tests/CustomObjectIoObjectTests.cs
git -C <worktree> commit -m "feat(upsert): CustomObjectIoObject upsert branch (merge by Record ID)"
```

---

### Task 4: Thread mode + tally created/updated (queue, service, runner, controller)

Carry the mode from the request to the descriptor, tally created/updated in the runner, and pass them to `usp_CompleteImport`. Add the controller's mode parsing + upsert mapping validation.

**Files:**
- Modify: `api/Api/Modules/ImportExport/ImportQueue.cs`, `ImportService.cs`, `ImportRunner.cs`, `ImportExportController.cs`
- Test: `api/Api.Tests/ImportExportControllerTests.cs`

**Interfaces:**
- Consumes: `ImportMode`, `ImportAction`, `ImportRowContext.Mode`, `ImportRowResult.Action` (Task 2); `usp_CompleteImport @CreatedRows/@UpdatedRows` (Task 1).

- [ ] **Step 1: `ImportJobMessage` carries the mode**

In `ImportQueue.cs`, add to `ImportJobMessage` (after `MappingJson`):

```csharp
    ImportMode Mode = ImportMode.Create);
```

(i.e. `…, string? MappingJson = null, ImportMode Mode = ImportMode.Create);`)

- [ ] **Step 2: `ImportService.StartAsync` accepts + forwards the mode**

In `ImportService.cs`, add `ImportMode mode` to the `IImportService.StartAsync` signature and the impl (after `mappingJson`), and pass it into the `ImportJobMessage`:

```csharp
        await _queue.EnqueueAsync(
            new ImportJobMessage(importId, workspaceId, userId, blobPath, fileName, operationId, objectType, mappingJson, mode),
            cancellationToken).ConfigureAwait(false);
```

(`GetStatusAsync` already returns the counts from Task 2 Step 4.)

- [ ] **Step 3: `ImportRunner` threads mode + tallies created/updated**

In `ImportRunner.cs`:
- Build the context with the mode:
  ```csharp
  var context = new ImportRowContext(message.WorkspaceId, message.StartedByUserId, actorEmail, message.OperationId, message.Mode);
  ```
- Add `created`/`updated` counters alongside `landed`/`flagged`, and in the per-row loop:
  ```csharp
  if (outcome == ImportRowResult.Landed)
  {
      landed++;
      if (action == ImportAction.Updated) { updated++; } else { created++; }
  }
  ```
  where `action` comes from the row result — extend `ProcessRowAsync` to also return the `Action` (return tuple gains `ImportAction Action`; the catch path returns `ImportAction.None`). Thread it through.
- Change `CompleteAsync` to accept + pass created/updated, and its `usp_CompleteImport` EXEC to include `@CreatedRows, @UpdatedRows`:
  ```csharp
  await _db.Database.ExecuteSqlRawAsync(
      "EXEC dbo.usp_CompleteImport @ImportId, @Status, @TotalRows, @LandedRows, @FlaggedRows, @CreatedRows, @UpdatedRows",
      new[]
      {
          new SqlParameter("@ImportId", importId),
          new SqlParameter("@Status", status),
          new SqlParameter("@TotalRows", total),
          new SqlParameter("@LandedRows", landed),
          new SqlParameter("@FlaggedRows", flagged),
          new SqlParameter("@CreatedRows", created),
          new SqlParameter("@UpdatedRows", updated),
      },
      cancellationToken).ConfigureAwait(false);
  ```
  Pass `created`/`updated` from `RunAsync` into `CompleteAsync`. (The parse-fail early returns pass `0, 0`.)

- [ ] **Step 4: Controller — parse mode + validate the upsert mapping**

In `ImportExportController.cs` `ImportCsv`, add a `[FromForm(Name = "mode")] string? mode` parameter. After resolving `ioObject` (and its `CanImport` check), add:

```csharp
        var importMode = string.Equals(mode, "upsert", StringComparison.OrdinalIgnoreCase) ? ImportMode.Upsert : ImportMode.Create;
        if (importMode == ImportMode.Upsert && !ioObject.CanUpsert)
        {
            return ValidationFailure("mode", "That object can't be updated by import. Use create-only.");
        }
```

Update `TryValidateMapping` to take the mode and, in upsert, allow `"id"` as a mapped key and require it:

```csharp
    private static bool TryValidateMapping(IIoObject ioObject, string mappingJson, ImportMode mode, out string error)
    {
        // …parse to `mapping` (unchanged)…
        var importKeys = new HashSet<string>(ioObject.ImportFields.Select(field => field.Key), StringComparer.Ordinal);
        if (mode == ImportMode.Upsert)
        {
            importKeys.Add("id"); // the Record ID match target — valid only in upsert
        }
        // …the existing per-entry importKeys.Contains + required-field checks…
        if (mode == ImportMode.Upsert && !mappedKeys.Contains("id"))
        {
            error = "Map a column to Record ID so rows can be matched to existing records.";
            return false;
        }
        // …existing required-field-of-object check…
    }
```

Pass `importMode` to `TryValidateMapping(ioObject, mapping, importMode, out var mappingError)` and to `_imports.StartAsync(…, mappingJson, importMode, cancellationToken)`. Note: in upsert mode a mapping is **required** (the id must be mapped), so the `!string.IsNullOrWhiteSpace(mapping)` guard around `TryValidateMapping` must also fail when upsert + no mapping — add: `if (importMode == ImportMode.Upsert && string.IsNullOrWhiteSpace(mapping)) return ValidationFailure("mapping", "Map columns (including Record ID) to update existing records.");`

- [ ] **Step 5: Controller tests**

In `ImportExportControllerTests.cs`, add: (a) upsert on a `CanUpsert=false` object → 400 (`FindForWorkspaceAsync` returns a mock with `CanUpsert=false` + a form `mode=upsert`); (b) upsert with a mapping that omits `id` → 400; (c) upsert with a mapping including `id` → 202 and `StartAsync` invoked with `ImportMode.Upsert`. Model on the existing `ImportCsv_*` tests (multipart form via `IFormFile` mock). The `StartAsync` mock signature now has the extra `ImportMode` arg — update its `It.IsAny<...>()` setup.

- [ ] **Step 6: Build + test + commit**

Run: `dotnet build api/Api` then `dotnet test api/Api.Tests` — all green.

```bash
git -C <worktree> add api/Api/Modules/ImportExport api/Api.Tests
git -C <worktree> commit -m "feat(upsert): thread import mode, tally created/updated, validate Record ID mapping"
```

---

### Task 5: Shared types + web api/hook

Wire the wire-contract changes to TypeScript and the import request.

**Files:**
- Modify: `shared/types/imports.ts`, `web/src/features/import-export/api.ts`, `web/src/features/import-export/useImportExport.ts`
- Test: `web/src/features/import-export/useImportExport.test.ts(x)` if it asserts the payload (grep; else covered in Task 6)

**Interfaces:**
- Produces: `IoObjectDto.canUpsert`, `ImportStatusDto.createdRows`/`.updatedRows`, the flagged-reason `code` union gains `"invalid-id" | "record-not-found"`, `startImport(..., mode?)`, `StartImportVariables.mode`.

- [ ] **Step 1: `shared/types/imports.ts`**

- Add `canUpsert: boolean;` to `IoObjectDto` (after `canExport`).
- Add to `ImportStatusDto` (after `landedRows`): `createdRows: number;` and `updatedRows: number;`
- Extend the `ImportFlaggedRow.reasons[].code` union with `| "invalid-id" | "record-not-found"`.
- Add a mode type: `export type ImportMode = "create" | "upsert";`

- [ ] **Step 2: `api.ts` `startImport` sends the mode**

Add a `mode?: ImportMode` parameter (after `mapping`) and append it when upsert:

```typescript
  if (mode && mode !== 'create') {
    form.append('mode', mode);
  }
```

- [ ] **Step 3: `useImportExport.ts`**

Add `mode: ImportMode;` to `StartImportVariables`, and pass it: `startImport(workspaceId as WorkspaceId, file, objectType, mapping, mode)`.

- [ ] **Step 4: Type-check + commit**

Run: `cd web && npx tsc --noEmit` (zero errors). If a hook/api test asserts the old payload, update it.

```bash
git -C <worktree> add shared/types/imports.ts web/src/features/import-export/api.ts web/src/features/import-export/useImportExport.ts
git -C <worktree> commit -m "feat(upsert): web contracts — canUpsert, created/updated, import mode"
```

---

### Task 6: Import wizard — mode toggle + Record ID mapping + report

The visible change: a "Create or update" toggle (only for `canUpsert` objects), a required **Record ID** mapping target in upsert mode, the mode carried to the run, and created/updated in the report line.

**Files:**
- Modify: `web/src/features/import-export/components/ImportWizard.tsx`, `web/src/features/import-export/components/ImportRunStep.tsx`
- Test: `web/src/features/import-export/components/ImportWizard.test.tsx`, `ImportRunStep.test.tsx`, and extend `CustomObjectWizards.test.tsx`

**Interfaces:**
- Consumes: `IoObjectDto.canUpsert`, `ImportStatusDto.createdRows/updatedRows`, `ImportMode` (Task 5).

- [ ] **Step 1: Write failing tests**

- `ImportWizard.test.tsx`: with a `canUpsert: true` object, the mode toggle renders; selecting "Create or update" makes the Map-columns step show a **"Record ID"** target and the Continue gate blocks until a column maps to it. With a `canUpsert: false` object, no toggle renders. axe on the upsert Map-columns state.
- `ImportRunStep.test.tsx`: given a `Completed` job with `createdRows: 3, updatedRows: 2`, the status line reads "3 created, 2 updated"; a `CompletedWithErrors` job shows created/updated/flagged. Pass `mode` prop and assert `start.mutate` receives it. axe on each state.

(Read the existing `ImportWizard.test.tsx`/`ImportRunStep.test.tsx` first for the harness + mock shapes.)

- [ ] **Step 2: `ImportWizard.tsx`**

- Add `const RECORD_ID_FIELD: IoFieldSpec = { key: 'id', label: 'Record ID', required: true };` (module-level constant).
- Add mode state: `const [mode, setMode] = useState<ImportMode>('create');`
- Show a mode control only when `active.canUpsert` (a segmented control / radio group: "Create only" / "Create or update"). Reset it in `chooseObject` (default `'create'`), and if the chosen object isn't `canUpsert`, force `'create'`.
- The fields used for mapping + validation become: `const importTargets = mode === 'upsert' ? [RECORD_ID_FIELD, ...active.importFields] : active.importFields;` — pass `importTargets` to `validateMapping`, `autoMapColumns` (on file load), and `ImportColumnMapper`'s `fields`. (Because `RECORD_ID_FIELD.required` is true, the existing `validateMapping` already enforces "map a column to Record ID.")
- Pass `mode` to `ImportRunStep`.

- [ ] **Step 3: `ImportRunStep.tsx`**

- Add `mode: ImportMode` to `ImportRunStepProps`; pass it in `start.mutate({ file, objectType, mapping, mode }, …)`.
- Update `statusLabel` to use created/updated:
  ```typescript
    case 'Completed':
      return `Completed — ${job.createdRows} created, ${job.updatedRows} updated.`;
    case 'CompletedWithErrors':
      return `Completed with issues — ${job.createdRows} created, ${job.updatedRows} updated, ${job.flaggedRows.length} flagged.`;
  ```
- Update the pre-run copy: `Each row becomes a new record.` → conditional on `mode` (`'upsert'` → "Rows with a Record ID update existing records; rows without one are created.").

- [ ] **Step 4: Run web tests + type-check**

Run: `cd web && npx tsc --noEmit` then `npx jest src/features/import-export`
Expected: PASS (new + existing), axe clean.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add web/src/features/import-export
git -C <worktree> commit -m "feat(upsert): import wizard mode toggle, Record ID mapping, created/updated report"
```

---

## Self-Review

**1. Spec coverage:**
- Match by Record ID only, blank→create, dead→flag, merge → Task 3. ✓
- CanUpsert capability + wizard mode toggle + Record ID target → Tasks 2, 6. ✓
- Created/updated reporting via migration + procs + status → Tasks 1, 2, 4, 6. ✓
- Custom objects only (built-ins CanUpsert=false; controller 400) → Tasks 2, 4. ✓
- No record-side proc (merge in C# via GetById+Patch) → Task 3. ✓

**2. Placeholder scan:** none — `<NNN>` migration number is a deliberate build-time verification (Global Constraints), not a content gap.

**3. Type consistency:** `ImportMode`/`ImportAction` defined in Task 2, consumed identically in Tasks 3–6. `ImportRowContext.Mode` / `ImportRowResult.Action` signatures match across Tasks 2–4. `ImportJobMessage.Mode` (Task 4) matches `StartAsync`'s new param and the runner's context build. `IoObjectDto.CanUpsert` / `ImportStatusResponse.CreatedRows/UpdatedRows` line up across API (Task 2) and TS (Task 5). `usp_CompleteImport` param order (Task 1) matches the runner EXEC (Task 4).

**4. Ambiguity:** upsert requires a mapping (id must be mapped) — enforced in Task 4 Step 4 both when a mapping is present and when it's absent.
