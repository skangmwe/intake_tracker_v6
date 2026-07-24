-- =============================================
-- tSQLt tests for dbo.usp_GetToolkitForWorkspace (Toolkit export read).
-- Covers: returns a workspace's toolkit items with all user-meaningful columns + the updater display
-- name (LEFT JOIN on the audit actor id), computes HasAttachment from the blob path, excludes soft-
-- deleted rows, excludes other workspaces, and paginates via OFFSET/FETCH.
-- database-testing.md (AAA, FakeTable, AssertEquals — assign to a local, never inline @Actual=(SELECT)).
-- =============================================

EXEC tSQLt.NewTestClass 'GetToolkitForWorkspaceTests';
GO

CREATE PROCEDURE GetToolkitForWorkspaceTests.[test_ReturnsWorkspaceItemsWithUpdaterAndHasAttachment_ExcludesForeignAndDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';
    DECLARE @User    UNIQUEIDENTIFIER = '2B000000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Users (UserId, DisplayName, IsDeleted)
    VALUES (@User, N'Sam Ruiz', 0);

    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, OneLiner, Description, Maintainer, HowTo, BodyMarkdown, AttachmentBlobPath, AttachmentFileName, UpdatedAt, UpdatedBy, IsDeleted)
    VALUES
        (N'TK-0001', @Ws,      N'Prompt',   N'Active', N'Clause finder', N'Finds clauses', N'Desc', N'Team AI', N'Run it', N'# Body', N'blob/guide.pdf', N'guide.pdf', SYSUTCDATETIME(), CAST(@User AS NVARCHAR(256)), 0), -- included, has attachment
        (N'TK-0002', @Ws,      N'Playbook', N'Draft',  N'Setup guide',   NULL,             NULL,    NULL,      NULL,     NULL,     NULL,            NULL,        SYSUTCDATETIME(), N'system-seed',               0), -- included, no attachment, non-user actor
        (N'TK-0003', @Ws,      N'Prompt',   N'Active', N'Deleted item',  NULL,             NULL,    NULL,      NULL,     NULL,     NULL,            NULL,        SYSUTCDATETIME(), CAST(@User AS NVARCHAR(256)), 1), -- soft-deleted — excluded
        (N'TK-0004', @OtherWs, N'Prompt',   N'Active', N'Foreign item',  NULL,             NULL,    NULL,      NULL,     NULL,     NULL,            NULL,        SYSUTCDATETIME(), CAST(@User AS NVARCHAR(256)), 0); -- other workspace — excluded

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20), Kind NVARCHAR(20), Status NVARCHAR(20), Name NVARCHAR(200), OneLiner NVARCHAR(400),
        Description NVARCHAR(MAX), Maintainer NVARCHAR(200), HowTo NVARCHAR(MAX), BodyMarkdown NVARCHAR(MAX), AttachmentFileName NVARCHAR(400),
        HasAttachment BIT, UpdatedAt DATETIME2, UpdatedByName NVARCHAR(200));
    INSERT INTO #Actual EXEC dbo.usp_GetToolkitForWorkspace @WorkspaceId = @Ws, @Page = 1, @PageSize = 100;

    -- Assert — only the two live items in this workspace are returned.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    -- The item with a blob path reports HasAttachment = 1 and resolves the updater name.
    DECLARE @HasAtt BIT = (SELECT HasAttachment FROM #Actual WHERE RecordId = N'TK-0001');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @HasAtt;

    DECLARE @Name NVARCHAR(200) = (SELECT UpdatedByName FROM #Actual WHERE RecordId = N'TK-0001');
    EXEC tSQLt.AssertEqualsString @Expected = N'Sam Ruiz', @Actual = @Name;

    -- The item with no blob path reports HasAttachment = 0 and a null updater name (non-user actor).
    DECLARE @NoAtt INT = (SELECT COUNT(*) FROM #Actual WHERE RecordId = N'TK-0002' AND HasAttachment = 0 AND UpdatedByName IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @NoAtt;

    -- The foreign-workspace item did not leak in.
    DECLARE @Foreign INT = (SELECT COUNT(*) FROM #Actual WHERE RecordId = N'TK-0004');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Foreign;
END;
GO

CREATE PROCEDURE GetToolkitForWorkspaceTests.[test_Paginates_SecondPageReturnsRemaining]
AS
BEGIN
    -- Arrange — three items ordered by name; page size 2 → page 2 holds the last one.
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, UpdatedAt, UpdatedBy, IsDeleted)
    VALUES
        (N'TK-0001', @Ws, N'Prompt', N'Active', N'Apple',  SYSUTCDATETIME(), N'system-seed', 0),
        (N'TK-0002', @Ws, N'Prompt', N'Active', N'Banana', SYSUTCDATETIME(), N'system-seed', 0),
        (N'TK-0003', @Ws, N'Prompt', N'Active', N'Cherry', SYSUTCDATETIME(), N'system-seed', 0);

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20), Kind NVARCHAR(20), Status NVARCHAR(20), Name NVARCHAR(200), OneLiner NVARCHAR(400),
        Description NVARCHAR(MAX), Maintainer NVARCHAR(200), HowTo NVARCHAR(MAX), BodyMarkdown NVARCHAR(MAX), AttachmentFileName NVARCHAR(400),
        HasAttachment BIT, UpdatedAt DATETIME2, UpdatedByName NVARCHAR(200));
    INSERT INTO #Actual EXEC dbo.usp_GetToolkitForWorkspace @WorkspaceId = @Ws, @Page = 2, @PageSize = 2;

    -- Assert — page 2 holds exactly the third item by name order (Cherry).
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Total;

    DECLARE @Name NVARCHAR(200) = (SELECT Name FROM #Actual);
    EXEC tSQLt.AssertEqualsString @Expected = N'Cherry', @Actual = @Name;
END;
GO
