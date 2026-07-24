-- =============================================
-- tSQLt tests for the platform-broadcast procs (announcements platform broadcast).
-- Covers:
--   usp_CreateAnnouncement          — stamps the supplied @BroadcastId on the new row
--   usp_QueryPlatformAnnouncements  — groups the per-workspace copies of one broadcast to a single row
--                                     with WorkspaceCount = number of copies; workspace-authored rows
--                                     (BroadcastId NULL) are excluded
--   usp_UpdateBroadcast             — edits every non-terminal copy sharing the BroadcastId
--   usp_RetireBroadcast             — archives every copy; @Found = 0 for an unknown broadcast
--   usp_ListPlatformWorkspaces      — every non-deleted workspace except the PG/Dept clone template
-- database-testing.md (AAA, FakeTable). Assertions assign the actual into a local variable first —
-- a subquery cannot be passed directly as an EXEC parameter value.
-- =============================================

EXEC tSQLt.NewTestClass 'PlatformAnnouncementsTests';
GO

CREATE PROCEDURE PlatformAnnouncementsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Announcements';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';

    INSERT INTO dbo.Users (UserId, DisplayName)
    VALUES ('00000000-0000-4000-8000-0000000000ad', N'Platform Admin');
END;
GO

-- Insert one broadcast copy directly (FakeTable strips defaults, so supply everything the reads touch).
CREATE PROCEDURE PlatformAnnouncementsTests.[InsertCopy]
    @Id UNIQUEIDENTIFIER, @Ws UNIQUEIDENTIFIER, @Bc UNIQUEIDENTIFIER,
    @Status NVARCHAR(16) = N'Published', @Title NVARCHAR(200) = N'Firm notice'
AS
BEGIN
    INSERT INTO dbo.Announcements
        (AnnouncementId, WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, ExpiresOn, Status,
         ScheduledPublishAt, AutoArchive, AutoArchiveAt, PublishedAt, BroadcastId,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES
        (@Id, @Ws, '00000000-0000-4000-8000-0000000000ad', @Title, N'Body', N'{"kind":"everyone"}', 0, NULL,
         @Status, NULL, 1, NULL, SYSUTCDATETIME(), @Bc,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's', 0);
END;
GO

-- ── usp_CreateAnnouncement — stamps BroadcastId ──────────────────────────────
-- FakeTable strips the AnnouncementId default, so the @NewId OUTPUT comes back NULL on the fake row;
-- the SetUp table is empty, so the single created row is asserted directly (no WHERE on the id).
CREATE PROCEDURE PlatformAnnouncementsTests.[test_CreateStampsBroadcastId]
AS
BEGIN
    DECLARE @Bc UNIQUEIDENTIFIER = '0B000000-0000-4000-8000-000000000001';
    DECLARE @NewId UNIQUEIDENTIFIER;

    EXEC dbo.usp_CreateAnnouncement
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @AuthorUserId = '00000000-0000-4000-8000-0000000000ad',
        @Title = N'T', @Body = N'B', @Audience = N'{"kind":"everyone"}', @Pinned = 0, @ExpiresOn = NULL,
        @Status = N'Published', @ScheduledPublishAt = NULL, @AutoArchive = 1, @CreatedBy = N'ad',
        @BroadcastId = @Bc, @AnnouncementId = @NewId OUTPUT;

    DECLARE @Actual UNIQUEIDENTIFIER = (SELECT TOP (1) BroadcastId FROM dbo.Announcements);
    EXEC tSQLt.AssertEquals @Bc, @Actual;
END;
GO

-- ── usp_CreateAnnouncement — omitting @BroadcastId leaves it NULL (workspace posts) ──
CREATE PROCEDURE PlatformAnnouncementsTests.[test_CreateWithoutBroadcastIdIsNull]
AS
BEGIN
    DECLARE @NewId UNIQUEIDENTIFIER;

    EXEC dbo.usp_CreateAnnouncement
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @AuthorUserId = '00000000-0000-4000-8000-0000000000ad',
        @Title = N'T', @Body = N'B', @Audience = N'{"kind":"everyone"}', @Pinned = 0, @ExpiresOn = NULL,
        @Status = N'Published', @ScheduledPublishAt = NULL, @AutoArchive = 1, @CreatedBy = N'ad',
        @AnnouncementId = @NewId OUTPUT;

    DECLARE @Cnt INT = (SELECT COUNT(*) FROM dbo.Announcements WHERE BroadcastId IS NULL);
    EXEC tSQLt.AssertEquals 1, @Cnt;
END;
GO

-- ── usp_QueryPlatformAnnouncements — three copies collapse to one row, count 3 ──
CREATE PROCEDURE PlatformAnnouncementsTests.[test_QueryGroupsCopiesByBroadcast]
AS
BEGIN
    DECLARE @Bc UNIQUEIDENTIFIER = '0B000000-0000-4000-8000-000000000002';
    EXEC PlatformAnnouncementsTests.[InsertCopy] '0A000000-0000-4000-8000-000000000001', '1A150000-0000-4000-8000-000000000001', @Bc;
    EXEC PlatformAnnouncementsTests.[InsertCopy] '0A000000-0000-4000-8000-000000000002', '1A150000-0000-4000-8000-000000000002', @Bc;
    EXEC PlatformAnnouncementsTests.[InsertCopy] '0A000000-0000-4000-8000-000000000003', '1A150000-0000-4000-8000-000000000003', @Bc;
    -- A workspace-authored row (no BroadcastId) must be excluded from the platform read.
    INSERT INTO dbo.Announcements
        (AnnouncementId, WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, Status,
         AutoArchive, PublishedAt, BroadcastId, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES
        ('0A000000-0000-4000-8000-0000000000ff', '1A150000-0000-4000-8000-000000000001',
         '00000000-0000-4000-8000-0000000000ad', N'WS only', N'B', N'{"kind":"everyone"}', 0, N'Published',
         1, SYSUTCDATETIME(), NULL, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's', 0);

    CREATE TABLE #r (
        BroadcastId UNIQUEIDENTIFIER, Title NVARCHAR(200), Body NVARCHAR(MAX), Pinned BIT,
        PublishedAt DATETIME2, ScheduledPublishAt DATETIME2, AutoArchive BIT, AutoArchiveAt DATETIME2,
        Status NVARCHAR(16), AuthorUserId UNIQUEIDENTIFIER, AuthorName NVARCHAR(256), PostedAt DATETIME2,
        WorkspaceCount INT, TotalCount INT);
    INSERT INTO #r EXEC dbo.usp_QueryPlatformAnnouncements @Page = 1, @PageSize = 20;

    DECLARE @Rows INT = (SELECT COUNT(*) FROM #r);
    DECLARE @Count INT = (SELECT WorkspaceCount FROM #r);
    EXEC tSQLt.AssertEquals 1, @Rows;
    EXEC tSQLt.AssertEquals 3, @Count;
END;
GO

-- ── usp_UpdateBroadcast — edits every copy ───────────────────────────────────
CREATE PROCEDURE PlatformAnnouncementsTests.[test_UpdateBroadcastTouchesAllCopies]
AS
BEGIN
    DECLARE @Bc UNIQUEIDENTIFIER = '0B000000-0000-4000-8000-000000000003';
    EXEC PlatformAnnouncementsTests.[InsertCopy] '0A000000-0000-4000-8000-000000000011', '1A150000-0000-4000-8000-000000000001', @Bc, N'Published', N'Old';
    EXEC PlatformAnnouncementsTests.[InsertCopy] '0A000000-0000-4000-8000-000000000012', '1A150000-0000-4000-8000-000000000002', @Bc, N'Published', N'Old';
    DECLARE @Found BIT;

    EXEC dbo.usp_UpdateBroadcast
        @BroadcastId = @Bc, @Title = N'New', @Body = N'B2', @Pinned = 1, @Status = N'Published',
        @ScheduledPublishAt = NULL, @AutoArchive = 1, @ExpiresOn = NULL, @UpdatedBy = N'ad', @Found = @Found OUTPUT;

    DECLARE @Updated INT = (SELECT COUNT(*) FROM dbo.Announcements WHERE BroadcastId = @Bc AND Title = N'New');
    EXEC tSQLt.AssertEquals 1, @Found;
    EXEC tSQLt.AssertEquals 2, @Updated;
END;
GO

-- ── usp_RetireBroadcast — archives every copy ────────────────────────────────
CREATE PROCEDURE PlatformAnnouncementsTests.[test_RetireBroadcastArchivesAllCopies]
AS
BEGIN
    DECLARE @Bc UNIQUEIDENTIFIER = '0B000000-0000-4000-8000-000000000004';
    EXEC PlatformAnnouncementsTests.[InsertCopy] '0A000000-0000-4000-8000-000000000021', '1A150000-0000-4000-8000-000000000001', @Bc;
    EXEC PlatformAnnouncementsTests.[InsertCopy] '0A000000-0000-4000-8000-000000000022', '1A150000-0000-4000-8000-000000000002', @Bc;
    DECLARE @Found BIT;

    EXEC dbo.usp_RetireBroadcast @BroadcastId = @Bc, @UpdatedBy = N'ad', @Found = @Found OUTPUT;

    DECLARE @Archived INT = (SELECT COUNT(*) FROM dbo.Announcements WHERE BroadcastId = @Bc AND Status = N'Archived');
    EXEC tSQLt.AssertEquals 1, @Found;
    EXEC tSQLt.AssertEquals 2, @Archived;
END;
GO

-- ── usp_RetireBroadcast — unknown broadcast → @Found = 0 ─────────────────────
CREATE PROCEDURE PlatformAnnouncementsTests.[test_RetireBroadcastUnknownIsNotFound]
AS
BEGIN
    DECLARE @Found BIT;
    EXEC dbo.usp_RetireBroadcast
        @BroadcastId = '0B000000-0000-4000-8000-0000000000ee', @UpdatedBy = N'ad', @Found = @Found OUTPUT;
    EXEC tSQLt.AssertEquals 0, @Found;
END;
GO

-- ── usp_ListPlatformWorkspaces — excludes template + deleted ─────────────────
CREATE PROCEDURE PlatformAnnouncementsTests.[test_ListPlatformWorkspacesExcludesTemplateAndDeleted]
AS
BEGIN
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'AI Solutions', N'ai-solutions', N'AIS', 1, 0),
           ('1A150000-0000-4000-8000-000000000002', N'Litigation', N'pg-dept', N'LIT', 1, 0),
           ('1A150000-0000-4000-8000-000000000003', N'Template', N'pg-dept-template', N'TPL', 1, 0),
           ('1A150000-0000-4000-8000-000000000004', N'Gone', N'pg-dept', N'GON', 1, 1);

    CREATE TABLE #w (WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(256), Kind NVARCHAR(64));
    INSERT INTO #w EXEC dbo.usp_ListPlatformWorkspaces;

    DECLARE @Cnt INT = (SELECT COUNT(*) FROM #w);
    DECLARE @HasTemplate INT = (SELECT COUNT(*) FROM #w WHERE Kind = N'pg-dept-template');
    EXEC tSQLt.AssertEquals 2, @Cnt;
    EXEC tSQLt.AssertEquals 0, @HasTemplate;
END;
GO
