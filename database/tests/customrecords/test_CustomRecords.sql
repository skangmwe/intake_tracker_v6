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
    -- usp_QueryCustomRecords reads the object's user fields (the filter/sort whitelist) from here.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
END;
GO

-- A helper: seed one active object so create's existence check passes. ObjectKey 'vendor' is the
-- slug that ties the object to its FieldDefinition rows (FieldDefinition.ObjectType = 'vendor').
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

-- A helper: seed one active, non-retired user field for the 'vendor' object (drives the filter/sort
-- whitelist). IsRetired is set explicitly — FakeTable drops the real table's DEFAULT 0.
CREATE PROCEDURE CustomRecordsTests.[SeedField]
    @Ws UNIQUEIDENTIFIER, @Key NVARCHAR(64), @Type NVARCHAR(32)
AS
BEGIN
    INSERT INTO dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey, FieldType, IsDeleted, IsRetired)
    VALUES (@Ws, N'vendor', @Key, @Type, 0, 0);
END;
GO

-- A helper: seed one active in-scope record with a raw FieldValues JSON bag.
CREATE PROCEDURE CustomRecordsTests.[SeedRecord]
    @ObjectId UNIQUEIDENTIFIER, @Ws UNIQUEIDENTIFIER, @Name NVARCHAR(400), @FieldValues NVARCHAR(MAX)
AS
BEGIN
    INSERT INTO dbo.CustomRecords
        (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @ObjectId, @Ws, @Name, @FieldValues, 0,
            SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');
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

CREATE PROCEDURE CustomRecordsTests.[test_Create_AgainstGlobalObject_InsertsWithCallerWorkspace]
AS
BEGIN
    -- Arrange — a Global object (WorkspaceId NULL, Location='Global') — SP3b Slice 1 lets any
    -- workspace target it. The inserted record must still carry the CALLER's own @WorkspaceId.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000D1';
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Obj, NULL, N'firm-policy', N'Firm Policy', N'Global', 0,
            SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');
    DECLARE @Id UNIQUEIDENTIFIER;

    -- Act
    EXEC dbo.usp_CreateCustomRecord
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Name = N'Q4 Retention Policy',
        @FieldValuesJson = N'{}', @ActorUserId = N'u1', @RecordId = @Id OUTPUT;

    -- Assert — the row exists, scoped to the caller's workspace, against the Global object.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.CustomRecords
        WHERE RecordId = @Id AND WorkspaceId = @Ws AND ObjectDefinitionId = @Obj
          AND Name = N'Q4 Retention Policy' AND IsDeleted = 0);
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

-- =============================================
-- usp_QueryCustomRecords — JSON-field filter/sort (Slice A / Task A2)
-- =============================================

CREATE PROCEDURE CustomRecordsTests.[test_Query_TextFilter_ContainsCaseInsensitive]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedField  @Ws, N'note', N'ShortText';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'HasHello',  N'{"note":"Hello World"}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'NoMatch',   N'{"note":"Goodbye"}';

    -- Act — lowercase 'hello' must still match 'Hello World' (default CI collation).
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"note":{"type":"text","contains":"hello"}}';

    -- Assert — only the matching row.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEqualsString @Expected = N'HasHello', @Actual = (SELECT TOP 1 Name FROM #act);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_SelectFilter_MatchesAnyValue]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedField  @Ws, N'status', N'SingleSelect';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'A', N'{"status":"Open"}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'B', N'{"status":"Closed"}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'C', N'{"status":"Pending"}';

    -- Act — IN over the supplied values.
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"status":{"type":"select","values":["Open","Closed"]}}';

    -- Assert — the two matching rows, not the Pending one.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #act WHERE Name = N'C');
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_NumberFilter_GreaterEqual_ComparesNumerically]
AS
BEGIN
    -- Arrange — values 9 and 100. Lexically '9' >= '10' is TRUE; numerically it is FALSE. The proc
    -- must compare numerically, so ">= 10" returns 100 (Big) only.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedField  @Ws, N'spend', N'Number';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Big',   N'{"spend":100}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Small', N'{"spend":9}';

    -- Act
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"spend":{"type":"number","op":">=","value":10}}';

    -- Assert — exactly the numerically-qualifying row.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEqualsString @Expected = N'Big', @Actual = (SELECT TOP 1 Name FROM #act);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_DateRangeFilter_RespectsFromTo]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedField  @Ws, N'due', N'Date';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Jan', N'{"due":"2026-01-15"}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Jun', N'{"due":"2026-06-15"}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Dec', N'{"due":"2026-12-15"}';

    -- Act — the window covers only the June record.
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"due":{"type":"date","from":"2026-03-01","to":"2026-09-01"}}';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEqualsString @Expected = N'Jun', @Actual = (SELECT TOP 1 Name FROM #act);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_NameContainsFilter]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Acme Corp', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Beta Inc',  N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Gamma LLC', N'{}';

    -- Act — 'corp' contains-match on the stable Name column.
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"name":{"type":"text","contains":"corp"}}';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEqualsString @Expected = N'Acme Corp', @Actual = (SELECT TOP 1 Name FROM #act);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_SortByNumberDesc_OrdersNumerically]
AS
BEGIN
    -- Arrange — 100 must sort before 9 in DESC order numerically (lexically '9' > '100').
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedField  @Ws, N'spend', N'Number';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Big',   N'{"spend":100}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Small', N'{"spend":9}';

    -- Act — capture returned order via an identity ordinal.
    CREATE TABLE #act (Ord INT IDENTITY(1,1), RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act (RecordId, Name, FieldValues, RowVer, TotalCount) EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = NULL, @SortColumn = N'spend', @SortDir = N'desc';

    -- Assert — Big (100) first, Small (9) second.
    EXEC tSQLt.AssertEqualsString @Expected = N'Big',   @Actual = (SELECT Name FROM #act WHERE Ord = 1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Small', @Actual = (SELECT Name FROM #act WHERE Ord = 2);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_SortByNameAsc]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Charlie', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Alpha',   N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Bravo',   N'{}';

    -- Act
    CREATE TABLE #act (Ord INT IDENTITY(1,1), RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act (RecordId, Name, FieldValues, RowVer, TotalCount) EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = NULL, @SortColumn = N'name', @SortDir = N'asc';

    -- Assert — alphabetical order.
    EXEC tSQLt.AssertEqualsString @Expected = N'Alpha', @Actual = (SELECT Name FROM #act WHERE Ord = 1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Bravo', @Actual = (SELECT Name FROM #act WHERE Ord = 2);
    EXEC tSQLt.AssertEqualsString @Expected = N'Charlie', @Actual = (SELECT Name FROM #act WHERE Ord = 3);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_Pagination_Page2Size1_TotalCountReflectsFullSet]
AS
BEGIN
    -- Arrange — two matching rows; page 2 of size 1 returns exactly one, with TotalCount = 2.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Alpha', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Bravo', N'{}';

    -- Act — page 2, size 1, name asc → the second row (Bravo).
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 2, @PageSize = 1,
        @FiltersJson = NULL, @SortColumn = N'name', @SortDir = N'asc';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEqualsString @Expected = N'Bravo', @Actual = (SELECT TOP 1 Name FROM #act);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT TOP 1 TotalCount FROM #act);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_NullFilters_ReturnsAll]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'One', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Two', N'{}';

    -- Act — NULL filters → no predicates, all in-scope rows returned.
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25, @FiltersJson = NULL;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #act);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_UnknownFilterKey_IsIgnored]
AS
BEGIN
    -- Arrange — 'nosuchfield' is not a FieldDefinition row for this object.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'One', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Two', N'{}';

    -- Act — the unknown key contributes no predicate (not an error) → all rows returned.
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"nosuchfield":{"type":"text","contains":"x"}}';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #act);
END;
GO

-- =============================================
-- usp_GetCustomRecordById — CreatedBy projection (Slice A / Task A3)
-- =============================================

CREATE PROCEDURE CustomRecordsTests.[test_GetById_ReturnsCreatedBy]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    DECLARE @Id  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000040';
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Id, @Obj, @Ws, N'Named', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'creator-1', N'editor-2');

    -- Act — column order must match the proc's SELECT (…, CreatedAt, UpdatedAt, CreatedBy).
    CREATE TABLE #R (RecordId UNIQUEIDENTIFIER, ObjectDefinitionId UNIQUEIDENTIFIER, Name NVARCHAR(400),
        FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), CreatedAt DATETIME2, UpdatedAt DATETIME2, CreatedBy NVARCHAR(256));
    INSERT INTO #R EXEC dbo.usp_GetCustomRecordById @RecordId = @Id, @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj;

    -- Assert — CreatedBy is projected with the seeded value.
    EXEC tSQLt.AssertEqualsString @Expected = N'creator-1', @Actual = (SELECT TOP 1 CreatedBy FROM #R);
END;
GO

-- =============================================
-- usp_QueryCustomRecords — scoping, injection-hardening & LIKE-escape (Slice A / review remediation)
-- =============================================

CREATE PROCEDURE CustomRecordsTests.[test_Query_ReturnsOnlyTargetObjectAndWorkspace]
AS
BEGIN
    -- Arrange — target rows + one in a different workspace + one for a different object (same ws).
    DECLARE @Ws    UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj   UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    DECLARE @Other UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000BB';
    DECLARE @OtherWs UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000002';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedRecord @Obj,   @Ws,      N'Target1', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj,   @Ws,      N'Target2', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Other, @Ws,      N'ForeignObject', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj,   @OtherWs, N'ForeignWorkspace', N'{}';

    -- Act
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25, @FiltersJson = NULL;

    -- Assert — only the two target rows; neither foreign-scope row leaks in.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #act WHERE Name IN (N'ForeignObject', N'ForeignWorkspace'));
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_UnknownKeyWithSqlMetacharacters_IsIgnoredSafely]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'One', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Two', N'{}';

    -- Act — the filter key is NOT a real field and carries SQL metacharacters. It must be ignored
    -- (whitelist miss), the query must not error, and dbo.CustomRecords must survive.
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"x'''') DROP TABLE dbo.CustomRecords --":{"type":"select","values":["z"]}}';

    -- Assert — unfiltered row set returned, and the table still exists.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual =
        (SELECT COUNT(*) FROM sys.tables WHERE name = N'CustomRecords' AND schema_id = SCHEMA_ID(N'dbo'));
END;
GO

-- =============================================
-- usp_QueryCustomRecords — Global-field whitelist + cross-tenant leak exclusion (SP3b Slice 2a)
-- =============================================

CREATE PROCEDURE CustomRecordsTests.[test_Query_WhitelistsGlobalFieldAndOwnLocalField_ExcludesMislabelledForeignRow]
AS
BEGIN
    -- Arrange — workspace A's own local field, a TRUE platform Global field (WorkspaceId IS NULL,
    -- Location='Global'), and a DIFFERENT workspace B's row that is WORKSPACE-OWNED but
    -- MISLABELLED Location='Global' (WorkspaceId=@OtherWs, not NULL — FieldDefinition places no
    -- server-side constraint tying Location to WorkspaceId, so this row can exist). Filtering by
    -- A's own field or the true platform Global field must narrow the result set (they're in A's
    -- effective whitelist); filtering by B's mislabelled row must NOT narrow it — the Global arm
    -- requires WorkspaceId IS NULL, not Location alone, so B's row never leaks into A's whitelist
    -- even though it claims Location='Global' (mirrors test_ObjectDefinition.sql's
    -- test_WorkspaceOwnedRowMislabelledGlobal_DoesNotLeakCrossTenant).
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000002';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;

    INSERT INTO dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey, FieldType, Location, IsDeleted, IsRetired)
    VALUES
        (@Ws,      N'vendor', N'regionA', N'ShortText', N'LocalWorkspace', 0, 0), -- A's own local field
        (NULL,     N'vendor', N'firmTag', N'ShortText', N'Global',         0, 0), -- TRUE platform Global field
        (@OtherWs, N'vendor', N'regionB', N'ShortText', N'Global',         0, 0); -- B's row, MISLABELLED Global

    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'One', N'{"regionA":"East","firmTag":"Compliance","regionB":"West"}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Two', N'{"regionA":"West","firmTag":"Ops","regionB":"East"}';

    DECLARE @Act TABLE (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);

    -- Act + Assert 1 — the TRUE platform Global field narrows A's result set (it IS whitelisted).
    INSERT INTO @Act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"firmTag":{"type":"text","contains":"Compliance"}}';
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM @Act);
    EXEC tSQLt.AssertEqualsString @Expected = N'One', @Actual = (SELECT TOP 1 Name FROM @Act);
    DELETE FROM @Act;

    -- Act + Assert 2 — A's own local field narrows A's result set (it IS whitelisted).
    INSERT INTO @Act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"regionA":{"type":"text","contains":"East"}}';
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM @Act);
    EXEC tSQLt.AssertEqualsString @Expected = N'One', @Actual = (SELECT TOP 1 Name FROM @Act);
    DELETE FROM @Act;

    -- Act + Assert 3 — workspace B's MISLABELLED-Global row does NOT narrow A's result set. It is
    -- workspace-owned (WorkspaceId=@OtherWs, not NULL), so the Global arm's WorkspaceId IS NULL
    -- guard excludes it from A's whitelist — the predicate is a no-op (same as an unknown key) and
    -- every in-scope row still returns. This is the leak this fix closes: Location alone is not
    -- sufficient ownership evidence.
    INSERT INTO @Act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"regionB":{"type":"text","contains":"West"}}';
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM @Act);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_LocalFieldOverridesGlobalFieldOfSameKey_NoWhitelistCollision]
AS
BEGIN
    -- Arrange — A's own local field shares a FieldKey with a platform Global field on the same
    -- slug (usp_GetWorkspaceFields's "local override" case). The @Fields whitelist population must
    -- de-dupe by key (local wins) rather than violate its PRIMARY KEY on the duplicate FieldKey.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;

    INSERT INTO dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey, FieldType, Location, IsDeleted, IsRetired)
    VALUES
        (@Ws,  N'vendor', N'priority', N'ShortText', N'LocalWorkspace', 0, 0), -- A's own local override
        (NULL, N'vendor', N'priority', N'Number',     N'Global',        0, 0); -- platform Global (different type)

    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'Alpha', N'{"priority":"High"}';

    -- Act — filtering as text (matching the LOCAL override's type) must not error and must match.
    DECLARE @Act TABLE (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO @Act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"priority":{"type":"text","contains":"High"}}';

    -- Assert — no whitelist-insert collision (the proc would throw before returning anything), and
    -- the local field's semantics (text contains) governed the match.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM @Act);
    EXEC tSQLt.AssertEqualsString @Expected = N'Alpha', @Actual = (SELECT TOP 1 Name FROM @Act);
END;
GO

CREATE PROCEDURE CustomRecordsTests.[test_Query_TextFilter_EscapesLikeWildcards]
AS
BEGIN
    -- Arrange — a literal '%' in the search term must NOT act as a LIKE wildcard.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-000000000001';
    DECLARE @Obj UNIQUEIDENTIFIER = 'E0000000-0000-4000-8000-0000000000AA';
    EXEC CustomRecordsTests.SeedObject @Obj, @Ws;
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'100%off', N'{}';
    EXEC CustomRecordsTests.SeedRecord @Obj, @Ws, N'1000',    N'{}';

    -- Act — contains "100%": with escaping only '100%off' matches; unescaped, '%' would also match '1000'.
    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8), TotalCount INT);
    INSERT INTO #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @Ws, @ObjectDefinitionId = @Obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"name":{"type":"text","contains":"100%"}}';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #act);
    EXEC tSQLt.AssertEqualsString @Expected = N'100%off', @Actual = (SELECT TOP 1 Name FROM #act);
END;
GO
