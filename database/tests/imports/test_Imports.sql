-- =============================================
-- tSQLt tests for the Import procs (Slice 16 — CSV Import & Export).
-- Covers: usp_CreateImport (admin insert / non-admin denied -> no row, @Created 0),
--         usp_RecordImportRow (landed + flagged rows recorded),
--         usp_CompleteImport (terminal status + counts stamped),
--         usp_GetImportById (admin resolves / non-admin denied -> nothing),
--         usp_GetImportRows (admin sees only rows with reasons, ordered; non-admin sees nothing).
-- Import is WorkspaceAdmin-only (BS §13). Access is baked into every read/create proc via a
-- WorkspaceMembership admin join, so a forbidden or non-existent import is indistinguishable from
-- empty (the API answers 403, never disclosing existence). database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'ImportsTests';
GO

-- Shared arrange: workspace WS with an admin (aa) and a plain member (bb).
CREATE PROCEDURE ImportsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Imports';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ImportRows';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';

    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'WorkspaceAdmin', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', N'Member', 0);
END;
GO

CREATE PROCEDURE ImportsTests.[test_CreateInsertsForAdmin]
AS
BEGIN
    -- Act
    DECLARE @Created BIT;
    EXEC dbo.usp_CreateImport
        @ImportId = '33333333-3333-4333-8333-333333333333',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @FileName = N'requests.csv', @BlobPath = N'imports/1a15/3333.csv',
        @StartedByUserId = '00000000-0000-4000-8000-0000000000aa', @Created = @Created OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Created;
    DECLARE @Status NVARCHAR(24) = (SELECT Status FROM dbo.Imports WHERE ImportId = '33333333-3333-4333-8333-333333333333');
    EXEC tSQLt.AssertEquals @Expected = N'Processing', @Actual = @Status;
END;
GO

CREATE PROCEDURE ImportsTests.[test_CreateDeniedForNonAdmin]
AS
BEGIN
    -- Act — a plain member (bb) may not import (BS §13 — admin-only).
    DECLARE @Created BIT;
    EXEC dbo.usp_CreateImport
        @ImportId = '44444444-4444-4444-8444-444444444444',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @FileName = N'intruder.csv', @BlobPath = N'x',
        @StartedByUserId = '00000000-0000-4000-8000-0000000000bb', @Created = @Created OUTPUT;

    -- Assert — no row written, @Created 0 (the API turns this into a 403).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Created;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM dbo.Imports);
END;
GO

CREATE PROCEDURE ImportsTests.[test_RecordImportRowInsertsLandedAndFlagged]
AS
BEGIN
    -- Act — one landed row (with RecordId, no reason) and one flagged row (with reasons, no RecordId).
    EXEC dbo.usp_RecordImportRow
        @ImportId = '33333333-3333-4333-8333-333333333333', @RowIndex = 1,
        @Outcome = N'Landed', @RecordId = N'AIS-00000001', @ReasonsJson = NULL,
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa';
    EXEC dbo.usp_RecordImportRow
        @ImportId = '33333333-3333-4333-8333-333333333333', @RowIndex = 2,
        @Outcome = N'Flagged', @RecordId = NULL,
        @ReasonsJson = N'[{"code":"missing-required","message":"A request name is required.","field":"name"}]',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM dbo.ImportRows);
    DECLARE @LandedRecord NVARCHAR(20) = (SELECT RecordId FROM dbo.ImportRows WHERE RowIndex = 1);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @LandedRecord;
    DECLARE @FlaggedOutcome NVARCHAR(16) = (SELECT Outcome FROM dbo.ImportRows WHERE RowIndex = 2);
    EXEC tSQLt.AssertEquals @Expected = N'Flagged', @Actual = @FlaggedOutcome;
END;
GO

CREATE PROCEDURE ImportsTests.[test_CompleteStampsStatusAndCounts]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.Imports (ImportId, WorkspaceId, FileName, BlobPath, Status, StartedByUserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('33333333-3333-4333-8333-333333333333', '1A150000-0000-4000-8000-000000000001', N'r.csv', N'p', N'Processing',
            '00000000-0000-4000-8000-0000000000aa', 0, N'aa', N'aa');

    -- Act
    EXEC dbo.usp_CompleteImport
        @ImportId = '33333333-3333-4333-8333-333333333333',
        @Status = N'CompletedWithErrors', @TotalRows = 5, @LandedRows = 4, @FlaggedRows = 1;

    -- Assert
    DECLARE @Status NVARCHAR(24), @Total INT, @Landed INT, @Flagged INT, @HasCompletedAt BIT;
    SELECT @Status = Status, @Total = TotalRows, @Landed = LandedRows, @Flagged = FlaggedRows,
           @HasCompletedAt = CASE WHEN CompletedAt IS NULL THEN 0 ELSE 1 END
    FROM dbo.Imports WHERE ImportId = '33333333-3333-4333-8333-333333333333';
    EXEC tSQLt.AssertEquals @Expected = N'CompletedWithErrors', @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 5, @Actual = @Total;
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Landed;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Flagged;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @HasCompletedAt;
END;
GO

CREATE PROCEDURE ImportsTests.[test_CompleteStampsCreatedAndUpdatedRows]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.Imports (ImportId, WorkspaceId, FileName, BlobPath, Status, StartedByUserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('33333333-3333-4333-8333-333333333333', '1A150000-0000-4000-8000-000000000001', N'r.csv', N'p', N'Processing',
            '00000000-0000-4000-8000-0000000000aa', 0, N'aa', N'aa');

    -- Act — an upsert import: 3 new records created, 2 existing records updated.
    EXEC dbo.usp_CompleteImport
        @ImportId = '33333333-3333-4333-8333-333333333333',
        @Status = N'Completed', @TotalRows = 5, @LandedRows = 5, @FlaggedRows = 0,
        @CreatedRows = 3, @UpdatedRows = 2;

    -- Assert
    DECLARE @Created INT = (SELECT CreatedRows FROM dbo.Imports WHERE ImportId = '33333333-3333-4333-8333-333333333333');
    DECLARE @Updated INT = (SELECT UpdatedRows FROM dbo.Imports WHERE ImportId = '33333333-3333-4333-8333-333333333333');
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Created;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Updated;
END;
GO

CREATE PROCEDURE ImportsTests.[test_GetImportByIdResolvesForAdminDeniesNonAdmin]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.Imports (ImportId, WorkspaceId, FileName, BlobPath, Status, TotalRows, LandedRows, FlaggedRows, StartedByUserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('33333333-3333-4333-8333-333333333333', '1A150000-0000-4000-8000-000000000001', N'r.csv', N'p', N'Completed', 3, 3, 0,
            '00000000-0000-4000-8000-0000000000aa', 0, N'aa', N'aa');

    -- Act (admin)
    CREATE TABLE #Admin (ImportId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, FileName NVARCHAR(400),
        Status NVARCHAR(24), TotalRows INT, LandedRows INT, FlaggedRows INT, CreatedRows INT, UpdatedRows INT,
        StartedByUserId UNIQUEIDENTIFIER, StartedAt DATETIME2, CompletedAt DATETIME2);
    INSERT INTO #Admin
    EXEC dbo.usp_GetImportById @ImportId = '33333333-3333-4333-8333-333333333333', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Act (non-admin member)
    CREATE TABLE #Member (ImportId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, FileName NVARCHAR(400),
        Status NVARCHAR(24), TotalRows INT, LandedRows INT, FlaggedRows INT, CreatedRows INT, UpdatedRows INT,
        StartedByUserId UNIQUEIDENTIFIER, StartedAt DATETIME2, CompletedAt DATETIME2);
    INSERT INTO #Member
    EXEC dbo.usp_GetImportById @ImportId = '33333333-3333-4333-8333-333333333333', @UserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert — admin resolves the job; the plain member gets nothing (API → 403).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Admin);
    DECLARE @Landed INT = (SELECT TOP 1 LandedRows FROM #Admin);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Landed;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #Member);
END;
GO

CREATE PROCEDURE ImportsTests.[test_GetImportRowsReturnsOnlyReasonedRowsForAdmin]
AS
BEGIN
    -- Arrange — one landed-clean row (no reason), one flagged row (with reasons).
    INSERT INTO dbo.Imports (ImportId, WorkspaceId, FileName, BlobPath, Status, StartedByUserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('33333333-3333-4333-8333-333333333333', '1A150000-0000-4000-8000-000000000001', N'r.csv', N'p', N'CompletedWithErrors',
            '00000000-0000-4000-8000-0000000000aa', 0, N'aa', N'aa');
    INSERT INTO dbo.ImportRows (ImportRowId, ImportId, RowIndex, Outcome, RecordId, ReasonsJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '33333333-3333-4333-8333-333333333333', 1, N'Landed', N'AIS-00000001', NULL, 0, N'aa', N'aa'),
           (NEWID(), '33333333-3333-4333-8333-333333333333', 2, N'Flagged', NULL,
            N'[{"code":"invalid-value","message":"Business Value must be a whole number from 1 to 5.","field":"businessValue"}]', 0, N'aa', N'aa');

    -- Act (admin)
    CREATE TABLE #Rows (RowIndex INT, Outcome NVARCHAR(16), RecordId NVARCHAR(20), ReasonsJson NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_GetImportRows @ImportId = '33333333-3333-4333-8333-333333333333', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Act (non-admin)
    CREATE TABLE #NonAdmin (RowIndex INT, Outcome NVARCHAR(16), RecordId NVARCHAR(20), ReasonsJson NVARCHAR(MAX));
    INSERT INTO #NonAdmin
    EXEC dbo.usp_GetImportRows @ImportId = '33333333-3333-4333-8333-333333333333', @UserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert — only the flagged (reasoned) row is returned to the admin; the clean landed row is excluded.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    DECLARE @Index INT = (SELECT TOP 1 RowIndex FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Index;
    -- Non-admin sees nothing (API → 403).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #NonAdmin);
END;
GO
