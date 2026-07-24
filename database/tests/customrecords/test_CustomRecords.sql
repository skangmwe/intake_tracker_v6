-- =============================================
-- tSQLt tests for the custom-object record procs (Slice 1b). Covers:
--   usp_CreateCustomRecord (insert + returns id; unknown object → 50083),
--   usp_GetCustomRecordById (in-scope row; foreign workspace/object/soft-deleted → no row),
--   usp_QueryCustomRecords (pagination + TotalCount; excludes deleted + foreign scope),
--   usp_PatchCustomRecord (updates name + values; foreign scope → 50043),
--   usp_DeleteCustomRecord (soft-delete; second delete → 50043).
-- =============================================

EXEC tSQLt.NewTestClass 'CustomRecordsTests';
GO

CREATE PROCEDURE CustomRecordsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.CustomRecords';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ObjectDefinition';
END;
GO

-- A helper: seed one active object so create's existence check passes.
CREATE PROCEDURE CustomRecordsTests.[SeedObject]
    @ObjectId UNIQUEIDENTIFIER, @Ws UNIQUEIDENTIFIER
AS
BEGIN
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@ObjectId, @Ws, N'vendor', N'Vendor', N'LocalWorkspace', 0,
            SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Create_InsertsAndReturnsId]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    DECLARE @Id UNIQUEIDENTIFIER;

    -- Act
    EXEC dbo.usp_CreateCustomRecord
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Name = N'Acme Corp',
        @FieldValuesJson = N'{"rating":5}', @ActorUserId = N'u1', @RecordId = @Id OUTPUT;

    -- Assert — the row exists with the returned id, correct scope, and values.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.CustomRecords
        WHERE RecordId = @Id AND WorkspaceId = @Ws AND ObjectDefinitionId = @Obj
          AND Name = N'Acme Corp' AND FieldValues = N'{"rating":5}' AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Create_UnknownObject_Throws50083]
AS
BEGIN
    -- Arrange — no object seeded in this workspace.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = NEWID();
    DECLARE @Id  UNIQUEIDENTIFIER;

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50083;

    -- Act
    EXEC dbo.usp_CreateCustomRecord
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Name = N'X',
        @FieldValuesJson = N'{}', @ActorUserId = N'u1', @RecordId = @Id OUTPUT;
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_GetById_ReturnsRowOnlyInScope]
AS
BEGIN
    -- Arrange — one record + a soft-deleted one + a foreign-object one.
    DECLARE @Ws   UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    DECLARE @Live UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000010';
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Live, @Obj, @Ws, N'Live', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');

    -- Act
    CREATE TABLE #R (RecordId UNIQUEIDENTIFIER, ObjectDefinitionId UNIQUEIDENTIFIER, Name NVARCHAR(400),
        FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #R EXEC dbo.usp_GetCustomRecordById @RecordId = @Live, @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj;

    -- Assert — the in-scope record returns; a foreign workspace and a foreign object return nothing.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #R WHERE RecordId = @Live);

    DELETE FROM #R;
    INSERT INTO #R EXEC dbo.usp_GetCustomRecordById @RecordId = @Live, @WorkspaceId = NEWID(), @ObjectDefinitionId = @Obj;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #R);

    DELETE FROM #R;
    INSERT INTO #R EXEC dbo.usp_GetCustomRecordById @RecordId = @Live, @WorkspaceId = @Ws, @ObjectDefinitionId = NEWID();
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #R);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_GetById_SoftDeleted_ReturnsNothing]
AS
BEGIN
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    DECLARE @Del UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000011';
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Del, @Obj, @Ws, N'Gone', N'{}', 1, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');

    CREATE TABLE #R (RecordId UNIQUEIDENTIFIER, ObjectDefinitionId UNIQUEIDENTIFIER, Name NVARCHAR(400),
        FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #R EXEC dbo.usp_GetCustomRecordById @RecordId = @Del, @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj;

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #R);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_PaginatesExcludesDeletedAndForeign]
AS
BEGIN
    -- Arrange — 3 active in-scope + 1 deleted + 1 foreign object + 1 foreign workspace.
    DECLARE @Ws    UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj   UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    DECLARE @Other UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000BB';
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Obj,   @Ws,    N'Alpha',   N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj,   @Ws,    N'Bravo',   N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj,   @Ws,    N'Charlie', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj,   @Ws,    N'Deleted', N'{}', 1, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Other, @Ws,    N'Foreign', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj,   NEWID(),N'OtherWs', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');

    -- Act — page 1, size 2.
    CREATE TABLE #P (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX),
        RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #P EXEC dbo.usp_QueryCustomRecords @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 2;

    -- Assert — 2 rows on the page, TotalCount = 3 (the in-scope active set), first is 'Alpha' (name order).
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #P);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = (SELECT TOP 1 TotalCount FROM #P);
    EXEC tSQLt.AssertEqualsString @Expected = N'Alpha', @Actual = (SELECT TOP 1 Name FROM #P ORDER BY Name);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Patch_UpdatesNameAndValues]
AS
BEGIN
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    DECLARE @Id  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000020';
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Id, @Obj, @Ws, N'Old', N'{"a":1}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');

    -- Act
    EXEC dbo.usp_PatchCustomRecord
        @RecordId = @Id, @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj,
        @Name = N'New', @FieldValuesJson = N'{"a":2}', @ActorUserId = N'u2';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.CustomRecords
        WHERE RecordId = @Id AND Name = N'New' AND FieldValues = N'{"a":2}' AND UpdatedBy = N'u2');
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Patch_ForeignScope_Throws50043]
AS
BEGIN
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    DECLARE @Id  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000021';
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Id, @Obj, @Ws, N'X', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');

    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50043;

    -- Act — patch with a foreign workspace matches 0 rows.
    EXEC dbo.usp_PatchCustomRecord
        @RecordId = @Id, @WorkspaceId = NEWID(), @ObjectDefinitionId = @Obj,
        @Name = N'Y', @FieldValuesJson = N'{}', @ActorUserId = N'u2';
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Delete_SoftDeletesThenSecondDeleteThrows]
AS
BEGIN
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    DECLARE @Id  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000030';
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Id, @Obj, @Ws, N'X', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');

    -- Act — first delete soft-deletes the row.
    EXEC dbo.usp_DeleteCustomRecord @RecordId = @Id, @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @ActorUserId = N'u2';

    -- Assert — the row is soft-deleted.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.CustomRecords WHERE RecordId = @Id AND IsDeleted = 1 AND DeletedAt IS NOT NULL);

    -- A second delete matches 0 active rows → 50043 (idempotent-safe).
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50043;
    EXEC dbo.usp_DeleteCustomRecord @RecordId = @Id, @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @ActorUserId = N'u2';
END;
GO
