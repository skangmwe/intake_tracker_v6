-- =============================================
-- tSQLt tests for the Comments write/read procs and the immutability trigger (Slice 6).
-- Covers: comment create (member allowed / non-member denied), immutability (UPDATE / DELETE
--         / soft-delete rejected), and activity-thread interleave (comments + events in order,
--         comment.posted event twin excluded, access-gated). database-testing.md (AAA, FakeTable).
-- Note: a subquery cannot be passed directly as an EXEC parameter inside a procedure body, so
--       counts are read into a local variable before AssertEquals.
-- =============================================

EXEC tSQLt.NewTestClass 'CommentsTests';
GO

-- Immutability trigger setup: FakeTable strips triggers, so re-apply the real one.
CREATE PROCEDURE CommentsTests.[SetUpImmutability]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Comments';
    EXEC tSQLt.ApplyTrigger @TableName = 'dbo.Comments', @TriggerName = 'trg_Comments_PreventMutation';
END;
GO

CREATE PROCEDURE CommentsTests.[test_CommentInsertIsAllowed]
AS
BEGIN
    -- Arrange
    EXEC CommentsTests.SetUpImmutability;

    -- Act - an append is the only permitted write.
    INSERT INTO dbo.Comments (CommentId, RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request',
            '00000000-0000-4000-8000-0000000000aa', N'First note', SYSUTCDATETIME(), SYSUTCDATETIME(), N'aa', N'aa');

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Comments);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE CommentsTests.[test_CommentUpdateIsRejected]
AS
BEGIN
    -- Arrange
    EXEC CommentsTests.SetUpImmutability;
    INSERT INTO dbo.Comments (CommentId, RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request',
            '00000000-0000-4000-8000-0000000000aa', N'First note', SYSUTCDATETIME(), SYSUTCDATETIME(), N'aa', N'aa');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%immutable%';

    -- Act
    UPDATE dbo.Comments SET Body = N'edited';
END;
GO

CREATE PROCEDURE CommentsTests.[test_CommentDeleteIsRejected]
AS
BEGIN
    -- Arrange
    EXEC CommentsTests.SetUpImmutability;
    INSERT INTO dbo.Comments (CommentId, RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request',
            '00000000-0000-4000-8000-0000000000aa', N'First note', SYSUTCDATETIME(), SYSUTCDATETIME(), N'aa', N'aa');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%immutable%';

    -- Act
    DELETE FROM dbo.Comments;
END;
GO

CREATE PROCEDURE CommentsTests.[test_CommentSoftDeleteIsRejected]
AS
BEGIN
    -- Arrange - flipping IsDeleted is an UPDATE and must be rejected too.
    EXEC CommentsTests.SetUpImmutability;
    INSERT INTO dbo.Comments (CommentId, RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request',
            '00000000-0000-4000-8000-0000000000aa', N'First note', SYSUTCDATETIME(), SYSUTCDATETIME(), N'aa', N'aa');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%immutable%';

    -- Act
    UPDATE dbo.Comments SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME();
END;
GO

CREATE PROCEDURE CommentsTests.[test_CreateCommentInsertsForMember]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Comments';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    DECLARE @CommentId UNIQUEIDENTIFIER;

    -- Act
    EXEC dbo.usp_CreateComment
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @AuthorUserId = '00000000-0000-4000-8000-0000000000aa', @Body = N'Looks good to me',
        @MentionedUserIds = N'["00000000-0000-4000-8000-0000000000bb"]', @CommentId = @CommentId OUTPUT;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Comments);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    -- NVARCHAR(MAX)/LOB types can't be passed as SQL_VARIANT to AssertEquals — use a bounded length.
    DECLARE @Body NVARCHAR(256) = (SELECT CAST(Body AS NVARCHAR(256)) FROM dbo.Comments);
    EXEC tSQLt.AssertEquals @Expected = N'Looks good to me', @Actual = @Body;
    IF @CommentId IS NULL EXEC tSQLt.Fail @Message0 = 'Expected a CommentId to be returned.';
END;
GO

CREATE PROCEDURE CommentsTests.[test_CreateCommentDeniedForNonMember]
AS
BEGIN
    -- Arrange - record exists but the caller has no membership.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Comments';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{}', 0, N'seed', N'seed');

    DECLARE @CommentId UNIQUEIDENTIFIER = NEWID();

    -- Act
    EXEC dbo.usp_CreateComment
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @AuthorUserId = '00000000-0000-4000-8000-0000000000cc', @Body = N'Intruder',
        @MentionedUserIds = NULL, @CommentId = @CommentId OUTPUT;

    -- Assert - no row written, CommentId nulled out (the API turns this into a 403).
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Comments);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
    IF @CommentId IS NOT NULL EXEC tSQLt.Fail @Message0 = 'Expected CommentId to be NULL for a denied write.';
END;
GO

CREATE PROCEDURE CommentsTests.[test_ThreadInterleavesAndExcludesCommentTwin]
AS
BEGIN
    -- Arrange - one earlier event, one comment, plus a comment.posted twin that must NOT show.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Comments';
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, EventType, EventAt, EventPayload, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'request.created', '2026-07-01T09:00:00', N'{}', N'seed', N'seed'),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'comment.posted', '2026-07-01T11:00:00', N'{}', N'seed', N'seed');
    INSERT INTO dbo.Comments (CommentId, RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request',
            '00000000-0000-4000-8000-0000000000aa', N'A comment', '2026-07-01T11:00:00', '2026-07-01T11:00:00', N'aa', N'aa', 0);

    -- Act
    CREATE TABLE #Thread (Kind NVARCHAR(10), ItemAt DATETIME2, CommentId UNIQUEIDENTIFIER,
        AuthorUserId UNIQUEIDENTIFIER, Body NVARCHAR(MAX), MentionedUserIds NVARCHAR(MAX),
        EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, EventPayload NVARCHAR(MAX));
    INSERT INTO #Thread
    EXEC dbo.usp_GetActivityThread @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert - exactly 2 items (event + comment); the comment.posted twin is excluded.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Thread);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
    DECLARE @Twins INT = (SELECT COUNT(*) FROM #Thread WHERE EventType = N'comment.posted');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Twins;
    DECLARE @Comments INT = (SELECT COUNT(*) FROM #Thread WHERE Kind = N'comment');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Comments;
    -- Chronological: the created event comes first.
    DECLARE @FirstKind NVARCHAR(10) = (SELECT TOP 1 Kind FROM #Thread ORDER BY ItemAt ASC);
    EXEC tSQLt.AssertEquals @Expected = N'event', @Actual = @FirstKind;
END;
GO

CREATE PROCEDURE CommentsTests.[test_ThreadReturnsNothingForNonMember]
AS
BEGIN
    -- Arrange - comment + event exist but the caller has no membership.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Comments';
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, EventType, EventAt, EventPayload, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'request.created', '2026-07-01T09:00:00', N'{}', N'seed', N'seed');
    INSERT INTO dbo.Comments (CommentId, RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request',
            '00000000-0000-4000-8000-0000000000aa', N'A comment', '2026-07-01T11:00:00', '2026-07-01T11:00:00', N'aa', N'aa', 0);

    -- Act
    CREATE TABLE #Thread (Kind NVARCHAR(10), ItemAt DATETIME2, CommentId UNIQUEIDENTIFIER,
        AuthorUserId UNIQUEIDENTIFIER, Body NVARCHAR(MAX), MentionedUserIds NVARCHAR(MAX),
        EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, EventPayload NVARCHAR(MAX));
    INSERT INTO #Thread
    EXEC dbo.usp_GetActivityThread @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000ff';

    -- Assert - a non-member sees nothing (API answers 403, never disclosing existence).
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Thread);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Total;
END;
GO
