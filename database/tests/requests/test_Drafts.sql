-- =============================================
-- tSQLt tests for the Draft procs (Slice 5 — S26).
-- Covers: insert-new, update-existing, owner-scoped list, and owner-scoped hard delete.
-- =============================================

EXEC tSQLt.NewTestClass 'DraftsTests';
GO

CREATE PROCEDURE DraftsTests.[test_SaveDraftInsertsThenUpdates]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Drafts';
    DECLARE @Owner UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000aa';
    DECLARE @Ws    UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @DraftId UNIQUEIDENTIFIER;

    -- Act 1 — insert new (NULL id).
    EXEC dbo.usp_SaveDraft @DraftId = NULL, @OwnerUserId = @Owner, @WorkspaceId = @Ws,
        @ObjectType = N'Request', @Title = N'Draft one', @Body = N'{"fields":{"name":"Draft one"}}',
        @ActorUserId = N'actor', @OutDraftId = @DraftId OUTPUT;

    -- Assert 1
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Drafts);

    -- Act 2 — update the same draft.
    DECLARE @Same UNIQUEIDENTIFIER;
    EXEC dbo.usp_SaveDraft @DraftId = @DraftId, @OwnerUserId = @Owner, @WorkspaceId = @Ws,
        @ObjectType = N'Request', @Title = N'Draft renamed', @Body = N'{"fields":{"name":"Draft renamed"}}',
        @ActorUserId = N'actor', @OutDraftId = @Same OUTPUT;

    -- Assert 2 — still one row, retitled, same id.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Drafts);
    EXEC tSQLt.AssertEquals @Expected = N'Draft renamed', @Actual = (SELECT Title FROM dbo.Drafts WHERE DraftId = @DraftId);
    EXEC tSQLt.AssertEquals @Expected = @DraftId, @Actual = @Same;
END;
GO

CREATE PROCEDURE DraftsTests.[test_GetDraftsIsOwnerScoped]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Drafts';
    INSERT INTO dbo.Drafts (DraftId, OwnerUserId, WorkspaceId, ObjectType, Title, Body, LastEditedAt, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), '00000000-0000-4000-8000-0000000000aa', '1A150000-0000-4000-8000-000000000001', N'Request', N'Mine', N'{}', SYSUTCDATETIME(), N's', N's'),
        (NEWID(), '00000000-0000-4000-8000-0000000000bb', '1A150000-0000-4000-8000-000000000001', N'Request', N'Theirs', N'{}', SYSUTCDATETIME(), N's', N's');

    -- Act
    CREATE TABLE #Rows (DraftId UNIQUEIDENTIFIER, OwnerUserId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER,
                        ObjectType NVARCHAR(16), Title NVARCHAR(400), Body NVARCHAR(MAX), LastEditedAt DATETIME2, CreatedAt DATETIME2);
    INSERT INTO #Rows
    EXEC dbo.usp_GetDraftsForUser @OwnerUserId = '00000000-0000-4000-8000-0000000000aa',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request';

    -- Assert — only the caller's own draft.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'Mine', @Actual = (SELECT TOP 1 Title FROM #Rows);
END;
GO

CREATE PROCEDURE DraftsTests.[test_DeleteDraftIsOwnerScoped]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Drafts';
    DECLARE @DraftId UNIQUEIDENTIFIER = '44444444-4444-4444-8444-444444444444';
    INSERT INTO dbo.Drafts (DraftId, OwnerUserId, WorkspaceId, ObjectType, Title, Body, LastEditedAt, CreatedBy, UpdatedBy)
    VALUES (@DraftId, '00000000-0000-4000-8000-0000000000aa', '1A150000-0000-4000-8000-000000000001', N'Request', N'Mine', N'{}', SYSUTCDATETIME(), N's', N's');

    -- Act 1 — a non-owner cannot delete it.
    CREATE TABLE #R1 (Deleted INT);
    INSERT INTO #R1 EXEC dbo.usp_DeleteDraft @DraftId = @DraftId, @OwnerUserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert 1 — no row removed, draft still present.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT TOP 1 Deleted FROM #R1);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Drafts);

    -- Act 2 — the owner deletes it (hard delete).
    CREATE TABLE #R2 (Deleted INT);
    INSERT INTO #R2 EXEC dbo.usp_DeleteDraft @DraftId = @DraftId, @OwnerUserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert 2
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT TOP 1 Deleted FROM #R2);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM dbo.Drafts);
END;
GO
