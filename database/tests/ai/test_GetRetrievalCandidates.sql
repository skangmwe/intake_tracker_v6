-- =============================================
-- tSQLt tests for usp_GetRetrievalCandidates (Phase 4, Slice 2 — the retrieval permission boundary).
-- The top gate is test_NonMemberGetsZeroRows: a caller who is not a workspace member gets ZERO candidates
-- (so zero retrieved records, zero citations). Also covers: member sees visible embedded records with their
-- vector, unembedded records are excluded (INNER JOIN), closed records ($.outcome set) are excluded, and
-- soft-deleted records are excluded. database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'GetRetrievalCandidatesTests';
GO

CREATE PROCEDURE GetRetrievalCandidatesTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.RecordEmbedding';

    -- One member of the workspace under test.
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
END;
GO

-- Helper values reused across tests: a member-visible, open, embedded request.
CREATE PROCEDURE GetRetrievalCandidatesTests.[SeedOpenEmbeddedRequest]
    @RecordId NVARCHAR(20) = N'LIT-00000001',
    @FieldValues NVARCHAR(MAX) = N'{}',
    @IsDeleted BIT = 0
AS
BEGIN
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@RecordId, '1A150000-0000-4000-8000-000000000001', N'Contract helper', N'Summarise contracts', @FieldValues, @IsDeleted, N'seed', N'seed');

    INSERT INTO dbo.RecordEmbedding (EmbeddingId, WorkspaceId, ObjectType, RecordId, Model, Dimensions, Vector, ContentHash, EmbeddedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'Request', @RecordId, N'text-embedding-3-large', 3072, 0x0102, REPLICATE('A', 64), SYSUTCDATETIME(), 0, N'seed', N'seed');
END;
GO

CREATE PROCEDURE GetRetrievalCandidatesTests.[test_NonMemberGetsZeroRows]
AS
BEGIN
    -- Arrange - a visible, embedded, open request, but the caller is NOT a member.
    EXEC GetRetrievalCandidatesTests.SeedOpenEmbeddedRequest;

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Title NVARCHAR(400), Vector VARBINARY(MAX), KeywordScore INT);
    INSERT INTO #Hits EXEC dbo.usp_GetRetrievalCandidates
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000bb', @Query = N'contract';

    -- Assert - the permission invariant: a non-member retrieves nothing.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE GetRetrievalCandidatesTests.[test_ReturnsMemberVisibleRecordsWithVector]
AS
BEGIN
    -- Arrange
    EXEC GetRetrievalCandidatesTests.SeedOpenEmbeddedRequest;

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Title NVARCHAR(400), Vector VARBINARY(MAX), KeywordScore INT);
    INSERT INTO #Hits EXEC dbo.usp_GetRetrievalCandidates
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'contract';

    -- Assert - the member sees the record with its stored vector.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @HasVector INT = (SELECT COUNT(*) FROM #Hits WHERE Vector = 0x0102);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @HasVector;
END;
GO

CREATE PROCEDURE GetRetrievalCandidatesTests.[test_ExcludesUnembedded]
AS
BEGIN
    -- Arrange - a member-visible open request with NO embedding row.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'LIT-00000002', '1A150000-0000-4000-8000-000000000001', N'Contract helper two', N'', N'{}', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Title NVARCHAR(400), Vector VARBINARY(MAX), KeywordScore INT);
    INSERT INTO #Hits EXEC dbo.usp_GetRetrievalCandidates
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'contract';

    -- Assert - a record with no vector cannot be a retrieval candidate (INNER JOIN).
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE GetRetrievalCandidatesTests.[test_ExcludesClosed]
AS
BEGIN
    -- Arrange - the request is closed (an outcome is set in FieldValues, per usp_CloseRequest).
    EXEC GetRetrievalCandidatesTests.SeedOpenEmbeddedRequest @FieldValues = N'{"outcome":"Live"}';

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Title NVARCHAR(400), Vector VARBINARY(MAX), KeywordScore INT);
    INSERT INTO #Hits EXEC dbo.usp_GetRetrievalCandidates
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'contract';

    -- Assert - closed records are not retrieved.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE GetRetrievalCandidatesTests.[test_ExcludesSoftDeleted]
AS
BEGIN
    -- Arrange - the request is soft-deleted (its embedding remains, but the record is gone).
    EXEC GetRetrievalCandidatesTests.SeedOpenEmbeddedRequest @IsDeleted = 1;

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Title NVARCHAR(400), Vector VARBINARY(MAX), KeywordScore INT);
    INSERT INTO #Hits EXEC dbo.usp_GetRetrievalCandidates
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'contract';

    -- Assert - soft-deleted records are not retrieved.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO
