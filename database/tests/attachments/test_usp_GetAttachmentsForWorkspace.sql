-- =============================================
-- tSQLt tests for dbo.usp_GetAttachmentsForWorkspace (Attachment export read).
-- Covers: returns a workspace's attachments with the uploader display name (LEFT JOIN on the audit
-- actor id, so a non-user actor still exports with a null name), excludes soft-deleted rows, excludes
-- other workspaces, and paginates via OFFSET/FETCH.
-- database-testing.md (AAA, FakeTable, AssertEquals — assign to a local, never inline @Actual=(SELECT)).
-- =============================================

EXEC tSQLt.NewTestClass 'GetAttachmentsForWorkspaceTests';
GO

CREATE PROCEDURE GetAttachmentsForWorkspaceTests.[test_ReturnsWorkspaceAttachmentsWithUploader_ExcludesForeignAndDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Attachments';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';
    DECLARE @User    UNIQUEIDENTIFIER = '2B000000-0000-4000-8000-000000000001';
    DECLARE @Att1    UNIQUEIDENTIFIER = '3C000000-0000-4000-8000-000000000001';
    DECLARE @Att2    UNIQUEIDENTIFIER = '3C000000-0000-4000-8000-000000000002';

    INSERT INTO dbo.Users (UserId, DisplayName, IsDeleted)
    VALUES (@User, N'Alex Chen', 0);

    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes, IsLink, ExternalUrl, CreatedAt, CreatedBy, IsDeleted)
    VALUES
        (@Att1,   N'LIT-9004', N'Request', @Ws,      N'brief.pdf',  N'application/pdf', 2048, 0, NULL,                        SYSUTCDATETIME(), CAST(@User AS NVARCHAR(256)), 0), -- included, real uploader
        (@Att2,   N'LIT-9004', N'Request', @Ws,      N'seed.pdf',   N'application/pdf', 1024, 0, NULL,                        SYSUTCDATETIME(), N'system-seed',               0), -- included, non-user actor
        (NEWID(), N'LIT-9004', N'Request', @Ws,      N'gone.pdf',   N'application/pdf', 10,   0, NULL,                        SYSUTCDATETIME(), CAST(@User AS NVARCHAR(256)), 1), -- soft-deleted — excluded
        (NEWID(), N'FIN-2210', N'Request', @OtherWs, N'other.pdf',  N'application/pdf', 10,   0, NULL,                        SYSUTCDATETIME(), CAST(@User AS NVARCHAR(256)), 0); -- other workspace — excluded

    -- Act
    CREATE TABLE #Actual (AttachmentId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), FileName NVARCHAR(400),
        ContentType NVARCHAR(200), SizeBytes BIGINT, IsLink BIT, ExternalUrl NVARCHAR(2048), CreatedAt DATETIME2, UploadedByName NVARCHAR(200));
    INSERT INTO #Actual EXEC dbo.usp_GetAttachmentsForWorkspace @WorkspaceId = @Ws, @Page = 1, @PageSize = 100;

    -- Assert — only the two live attachments in this workspace are returned.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    -- The real uploader is resolved to a display name.
    DECLARE @Name NVARCHAR(200) = (SELECT UploadedByName FROM #Actual WHERE AttachmentId = @Att1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Alex Chen', @Actual = @Name;

    -- The non-user actor (system-seed) exports with a null name (LEFT JOIN, TRY_CAST fails).
    DECLARE @SeedNull INT = (SELECT COUNT(*) FROM #Actual WHERE AttachmentId = @Att2 AND UploadedByName IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @SeedNull;

    -- The foreign-workspace attachment did not leak in.
    DECLARE @Foreign INT = (SELECT COUNT(*) FROM #Actual WHERE RecordId = N'FIN-2210');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Foreign;
END;
GO

CREATE PROCEDURE GetAttachmentsForWorkspaceTests.[test_Paginates_SecondPageReturnsRemaining]
AS
BEGIN
    -- Arrange — three attachments; page size 2 → page 2 holds exactly one.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Attachments';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes, IsLink, ExternalUrl, CreatedAt, CreatedBy, IsDeleted)
    VALUES
        (NEWID(), N'LIT-9004', N'Request', @Ws, N'a.pdf', N'application/pdf', 1, 0, NULL, '2026-07-01T00:00:00', N'system-seed', 0),
        (NEWID(), N'LIT-9004', N'Request', @Ws, N'b.pdf', N'application/pdf', 1, 0, NULL, '2026-07-02T00:00:00', N'system-seed', 0),
        (NEWID(), N'LIT-9004', N'Request', @Ws, N'c.pdf', N'application/pdf', 1, 0, NULL, '2026-07-03T00:00:00', N'system-seed', 0);

    -- Act
    CREATE TABLE #Actual (AttachmentId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), FileName NVARCHAR(400),
        ContentType NVARCHAR(200), SizeBytes BIGINT, IsLink BIT, ExternalUrl NVARCHAR(2048), CreatedAt DATETIME2, UploadedByName NVARCHAR(200));
    INSERT INTO #Actual EXEC dbo.usp_GetAttachmentsForWorkspace @WorkspaceId = @Ws, @Page = 2, @PageSize = 2;

    -- Assert — page 2 holds exactly one attachment.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Total;
END;
GO
