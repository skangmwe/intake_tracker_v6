-- =============================================
-- tSQLt tests for usp_CloseRequest (Slice 10 — Closure, BS §8).
-- Covers: writing the outcome into FieldValues (so Display / Mirror Status derive it), the Duplicate
-- outcome storing its target, and the not-found guard (THROW 50043). database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'ClosureTests';
GO

CREATE PROCEDURE ClosureTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', 'A1150000-0000-4000-8000-000000000001', N'Extractor', N'execution',
            N'{"businessValue":4}', 0, N'seed', N'seed');
END;
GO

CREATE PROCEDURE ClosureTests.[test_CloseWritesOutcomeIntoFieldValues]
AS
BEGIN
    -- Act
    EXEC dbo.usp_CloseRequest
        @RecordId = N'AIS-00000001', @WorkspaceId = 'A1150000-0000-4000-8000-000000000001',
        @OutcomeKind = N'delivery', @OutcomeValue = N'Live', @Notes = N'shipped', @ActorUserId = N'aa';

    -- Assert — the derivations read $.outcome / $.outcomeKind / $.outcomeNotes.
    DECLARE @Fields NVARCHAR(MAX) = (SELECT FieldValues FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Live',     @Actual = JSON_VALUE(@Fields, '$.outcome');
    EXEC tSQLt.AssertEquals @Expected = N'delivery', @Actual = JSON_VALUE(@Fields, '$.outcomeKind');
    EXEC tSQLt.AssertEquals @Expected = N'shipped',  @Actual = JSON_VALUE(@Fields, '$.outcomeNotes');
    -- The pre-existing content field is preserved.
    EXEC tSQLt.AssertEquals @Expected = N'4', @Actual = JSON_VALUE(@Fields, '$.businessValue');
END;
GO

CREATE PROCEDURE ClosureTests.[test_CloseDuplicateStoresTarget]
AS
BEGIN
    -- Act
    EXEC dbo.usp_CloseRequest
        @RecordId = N'AIS-00000001', @WorkspaceId = 'A1150000-0000-4000-8000-000000000001',
        @OutcomeKind = N'local', @OutcomeValue = N'Duplicate', @DuplicateOfRecordId = N'LIT-00000009', @ActorUserId = N'aa';

    -- Assert
    DECLARE @Fields NVARCHAR(MAX) = (SELECT FieldValues FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Duplicate',    @Actual = JSON_VALUE(@Fields, '$.outcome');
    EXEC tSQLt.AssertEquals @Expected = N'LIT-00000009', @Actual = JSON_VALUE(@Fields, '$.duplicateOfRecordId');
END;
GO

CREATE PROCEDURE ClosureTests.[test_CloseNotFoundThrows]
AS
BEGIN
    -- Assert — a record the caller's side cannot resolve is never found (API maps to 403).
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not found%';
    -- Act — wrong workspace: the (RecordId, WorkspaceId) pair does not exist.
    EXEC dbo.usp_CloseRequest
        @RecordId = N'AIS-00000001', @WorkspaceId = 'B0000000-0000-4000-8000-000000000002',
        @OutcomeKind = N'delivery', @OutcomeValue = N'Live', @ActorUserId = N'aa';
END;
GO
