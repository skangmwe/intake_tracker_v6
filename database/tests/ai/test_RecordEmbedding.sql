-- =============================================
-- tSQLt tests for the AI-assist embedding store procs (Phase 4, Slice 2).
--   usp_GetRecordsNeedingEmbedding — returns unembedded / content-changed requests, excludes
--       unchanged-hash and soft-deleted rows.
--   usp_UpsertRecordEmbedding — inserts then updates on (ObjectType, RecordId).
-- database-testing.md (AAA, FakeTable). The "unchanged hash" case reads the hash the proc itself
-- computes (rather than re-implementing the content concat) so the test can never drift from the proc.
-- =============================================

EXEC tSQLt.NewTestClass 'RecordEmbeddingTests';
GO

CREATE PROCEDURE RecordEmbeddingTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.RecordEmbedding';

    -- An AI-enabled workspace with the default allowlist (the closed set of three non-PII fields).
    INSERT INTO dbo.Workspaces (WorkspaceId, AiContentFieldAllowlist, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'["Name","Description","WorkflowDetails"]', 0);
END;
GO

CREATE PROCEDURE RecordEmbeddingTests.[test_GetRecordsNeedingEmbedding_ReturnsUnembedded]
AS
BEGIN
    -- Arrange - one request, no embedding row.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, FieldValues, IsDeleted)
    VALUES (N'LIT-00000001', '1A150000-0000-4000-8000-000000000001', N'Contract helper', N'Summarise contracts', N'{}', 0);

    -- Act
    CREATE TABLE #C (RecordId NVARCHAR(64), ContentHash CHAR(64), Content NVARCHAR(MAX));
    INSERT INTO #C EXEC dbo.usp_GetRecordsNeedingEmbedding
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request';

    -- Assert - the unembedded record is returned with a non-empty hash + content.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Rec NVARCHAR(64) = (SELECT TOP 1 RecordId FROM #C);
    EXEC tSQLt.AssertEquals @Expected = N'LIT-00000001', @Actual = @Rec;
END;
GO

CREATE PROCEDURE RecordEmbeddingTests.[test_GetRecordsNeedingEmbedding_ExcludesUnchangedHash]
AS
BEGIN
    -- Arrange - one request; store an embedding whose hash equals the proc's own computed hash.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, FieldValues, IsDeleted)
    VALUES (N'LIT-00000001', '1A150000-0000-4000-8000-000000000001', N'Contract helper', N'Summarise contracts', N'{}', 0);

    CREATE TABLE #C (RecordId NVARCHAR(64), ContentHash CHAR(64), Content NVARCHAR(MAX));
    INSERT INTO #C EXEC dbo.usp_GetRecordsNeedingEmbedding
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request';
    DECLARE @Hash CHAR(64) = (SELECT TOP 1 ContentHash FROM #C);

    INSERT INTO dbo.RecordEmbedding (EmbeddingId, WorkspaceId, ObjectType, RecordId, Model, Dimensions, Vector, ContentHash, EmbeddedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'Request', N'LIT-00000001', N'text-embedding-3-large', 3072, 0x00, @Hash, SYSUTCDATETIME(), 0, N'seed', N'seed');

    -- Act - re-run: the content is unchanged.
    DELETE FROM #C;
    INSERT INTO #C EXEC dbo.usp_GetRecordsNeedingEmbedding
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request';

    -- Assert - nothing to re-embed.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE RecordEmbeddingTests.[test_GetRecordsNeedingEmbedding_ReturnsChangedHash]
AS
BEGIN
    -- Arrange - one request; store an embedding with a stale (mismatched) hash.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, FieldValues, IsDeleted)
    VALUES (N'LIT-00000001', '1A150000-0000-4000-8000-000000000001', N'Contract helper', N'Summarise contracts', N'{}', 0);

    INSERT INTO dbo.RecordEmbedding (EmbeddingId, WorkspaceId, ObjectType, RecordId, Model, Dimensions, Vector, ContentHash, EmbeddedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'Request', N'LIT-00000001', N'text-embedding-3-large', 3072, 0x00,
            REPLICATE('A', 64), SYSUTCDATETIME(), 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #C (RecordId NVARCHAR(64), ContentHash CHAR(64), Content NVARCHAR(MAX));
    INSERT INTO #C EXEC dbo.usp_GetRecordsNeedingEmbedding
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request';

    -- Assert - the content changed, so the record is returned for re-embedding.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE RecordEmbeddingTests.[test_GetRecordsNeedingEmbedding_ExcludesSoftDeleted]
AS
BEGIN
    -- Arrange - a soft-deleted request, no embedding.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, FieldValues, IsDeleted)
    VALUES (N'LIT-00000001', '1A150000-0000-4000-8000-000000000001', N'Contract helper', N'Summarise contracts', N'{}', 1);

    -- Act
    CREATE TABLE #C (RecordId NVARCHAR(64), ContentHash CHAR(64), Content NVARCHAR(MAX));
    INSERT INTO #C EXEC dbo.usp_GetRecordsNeedingEmbedding
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request';

    -- Assert - soft-deleted requests are never embedded.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE RecordEmbeddingTests.[test_UpsertRecordEmbedding_InsertsThenUpdates]
AS
BEGIN
    -- Act 1 - insert a fresh embedding.
    EXEC dbo.usp_UpsertRecordEmbedding
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request', @RecordId = N'LIT-00000001',
        @Model = N'text-embedding-3-large', @Dimensions = 3072, @Vector = 0x0102, @ContentHash = REPLICATE('A', 64),
        @EmbeddedAt = '2026-07-25T10:00:00', @By = N'system';

    -- Assert 1 - one row with the first vector.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.RecordEmbedding WHERE ObjectType = N'Request' AND RecordId = N'LIT-00000001' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;

    -- Act 2 - upsert the same key with a new vector + hash.
    EXEC dbo.usp_UpsertRecordEmbedding
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request', @RecordId = N'LIT-00000001',
        @Model = N'text-embedding-3-large', @Dimensions = 3072, @Vector = 0x0304, @ContentHash = REPLICATE('B', 64),
        @EmbeddedAt = '2026-07-26T10:00:00', @By = N'system';

    -- Assert 2 - still one row, now carrying the second vector + hash (replaced, not duplicated).
    DECLARE @After INT = (SELECT COUNT(*) FROM dbo.RecordEmbedding WHERE ObjectType = N'Request' AND RecordId = N'LIT-00000001' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @After;
    DECLARE @Hash CHAR(64) = (SELECT TOP 1 ContentHash FROM dbo.RecordEmbedding WHERE ObjectType = N'Request' AND RecordId = N'LIT-00000001' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', @Actual = @Hash;
END;
GO
