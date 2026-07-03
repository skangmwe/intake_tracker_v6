-- =============================================
-- tSQLt tests for dbo.usp_MintRecordId (Slice 1 — Foundation).
-- Covers: first mint = PREFIX-00000001, monotonic increment + counter update,
--         and the not-found error path. database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'MintRecordIdTests';
GO

CREATE PROCEDURE MintRecordIdTests.[test_FirstMintReturns00000001]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    INSERT INTO dbo.Workspaces (WorkspaceId, Prefix, NextSequence, IsDeleted)
    VALUES ('11111111-1111-4111-8111-111111111111', N'AIS', 0, 0);

    DECLARE @RecordId NVARCHAR(20);

    -- Act
    EXEC dbo.usp_MintRecordId
        @WorkspaceId = '11111111-1111-4111-8111-111111111111',
        @RecordId    = @RecordId OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @RecordId;
END;
GO

CREATE PROCEDURE MintRecordIdTests.[test_SuccessiveMintsIncrementAndPersist]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    INSERT INTO dbo.Workspaces (WorkspaceId, Prefix, NextSequence, IsDeleted)
    VALUES ('11111111-1111-4111-8111-111111111111', N'AIS', 0, 0);

    DECLARE @First NVARCHAR(20), @Second NVARCHAR(20);

    -- Act
    EXEC dbo.usp_MintRecordId @WorkspaceId = '11111111-1111-4111-8111-111111111111', @RecordId = @First OUTPUT;
    EXEC dbo.usp_MintRecordId @WorkspaceId = '11111111-1111-4111-8111-111111111111', @RecordId = @Second OUTPUT;

    DECLARE @Counter BIGINT = (SELECT NextSequence FROM dbo.Workspaces WHERE WorkspaceId = '11111111-1111-4111-8111-111111111111');

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000002', @Actual = @Second;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Counter;
END;
GO

CREATE PROCEDURE MintRecordIdTests.[test_MissingWorkspaceThrows]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';   -- empty
    DECLARE @RecordId NVARCHAR(20);

    -- Assert (expectation registered before the Act)
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%workspace not found%';

    -- Act
    EXEC dbo.usp_MintRecordId
        @WorkspaceId = '99999999-9999-4999-8999-999999999999',
        @RecordId    = @RecordId OUTPUT;
END;
GO

CREATE PROCEDURE MintRecordIdTests.[test_DeletedWorkspaceThrows]
AS
BEGIN
    -- Arrange — a soft-deleted workspace must not mint.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    INSERT INTO dbo.Workspaces (WorkspaceId, Prefix, NextSequence, IsDeleted)
    VALUES ('11111111-1111-4111-8111-111111111111', N'AIS', 0, 1);
    DECLARE @RecordId NVARCHAR(20);

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%workspace not found%';

    -- Act
    EXEC dbo.usp_MintRecordId
        @WorkspaceId = '11111111-1111-4111-8111-111111111111',
        @RecordId    = @RecordId OUTPUT;
END;
GO
