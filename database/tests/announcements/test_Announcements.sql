-- =============================================
-- tSQLt tests for the Announcements procs (Slice 13; reconciled 2026-07-21 — Depth C lifecycle).
-- Covers the reconciled contracts:
--   usp_CreateAnnouncement          — Published stamps PublishedAt/AutoArchiveAt; Scheduled holds; the
--                                     chosen AuthorUserId ("posted by") is stored
--   usp_GetAnnouncementById         — author/admin see any status; a member cannot see an unpublished row;
--                                     an outsider cannot see a Published one
--   usp_QueryAnnouncements          — the caller's Published, un-expired, in-audience history; AuthorName
--   usp_QueryAnnouncementsForManage — every status in the workspace, with AuthorName + PostedAt
--   usp_UpdateAnnouncement          — replaces editable fields incl. author/status; Archived is immutable;
--                                     Scheduled→Published publishes now
--   usp_PublishAnnouncement         — Draft/Scheduled→Published (idempotent; @NewlyPublished on transition);
--                                     Archived cannot publish
--   usp_RetireAnnouncement          — Status→Archived, idempotent
--   usp_TickAnnouncements           — publishes due Scheduled (returns them), archives due Published,
--                                     leaves future rows, is a no-op when nothing is due
-- database-testing.md (AAA, FakeTable). Assertions assign the actual into a local variable first —
-- a subquery/CASE cannot be passed directly as an EXEC parameter value.
-- =============================================

EXEC tSQLt.NewTestClass 'AnnouncementsTests';
GO

CREATE PROCEDURE AnnouncementsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Announcements';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    -- WS1 members: author aa, admin adm, plain member mem, role-holder rol. Outsider ff is NOT a member.
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000ad', N'WorkspaceAdmin', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000be', N'Member', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c0', N'Member', 0);
    -- rol holds the 'Manager' role label in WS1.
    INSERT INTO dbo.ApproverTeamMembership (WorkspaceId, RoleLabel, UserId, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'Manager', '00000000-0000-4000-8000-0000000000c0', 0);
    -- Display names for the poster join.
    INSERT INTO dbo.Users (UserId, DisplayName)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ann Author'),
           ('00000000-0000-4000-8000-0000000000be', N'Mem Ber');
END;
GO

-- Insert an announcement row directly (FakeTable strips the identity default, so supply the id).
CREATE PROCEDURE AnnouncementsTests.[InsertAnnouncement]
    @Id UNIQUEIDENTIFIER, @Status NVARCHAR(16), @Audience NVARCHAR(MAX),
    @Pinned BIT = 0, @ExpiresOn DATE = NULL, @PublishedAt DATETIME2 = NULL, @Title NVARCHAR(200) = N'Notice',
    @Author UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000aa',
    @ScheduledPublishAt DATETIME2 = NULL, @AutoArchive BIT = 1, @AutoArchiveAt DATETIME2 = NULL
AS
BEGIN
    INSERT INTO dbo.Announcements
        (AnnouncementId, WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, ExpiresOn, Status,
         ScheduledPublishAt, AutoArchive, AutoArchiveAt, PublishedAt,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES
        (@Id, '1A150000-0000-4000-8000-000000000001', @Author, @Title, N'Body',
         @Audience, @Pinned, @ExpiresOn, @Status,
         @ScheduledPublishAt, @AutoArchive, @AutoArchiveAt, @PublishedAt,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's', 0);
END;
GO

-- ── usp_GetAnnouncementById — visibility ─────────────────────────────────────
CREATE PROCEDURE AnnouncementsTests.[test_GetByIdAuthorSeesScheduled]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Scheduled',
        @Audience = N'{"kind":"everyone"}', @ScheduledPublishAt = '2999-01-01T00:00:00';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER,
        Title NVARCHAR(200), Body NVARCHAR(MAX), Audience NVARCHAR(MAX), Pinned BIT, ExpiresOn DATE, Status NVARCHAR(16),
        ScheduledPublishAt DATETIME2, AutoArchive BIT, AutoArchiveAt DATETIME2, PublishedAt DATETIME2, CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #r EXEC dbo.usp_GetAnnouncementById @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @cnt;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_GetByIdMemberDeniedForScheduled]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Scheduled',
        @Audience = N'{"kind":"everyone"}', @ScheduledPublishAt = '2999-01-01T00:00:00';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER,
        Title NVARCHAR(200), Body NVARCHAR(MAX), Audience NVARCHAR(MAX), Pinned BIT, ExpiresOn DATE, Status NVARCHAR(16),
        ScheduledPublishAt DATETIME2, AutoArchive BIT, AutoArchiveAt DATETIME2, PublishedAt DATETIME2, CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #r EXEC dbo.usp_GetAnnouncementById @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UserId = '00000000-0000-4000-8000-0000000000be';

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @cnt;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_GetByIdOutsiderDeniedForPublished]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published',
        @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER,
        Title NVARCHAR(200), Body NVARCHAR(MAX), Audience NVARCHAR(MAX), Pinned BIT, ExpiresOn DATE, Status NVARCHAR(16),
        ScheduledPublishAt DATETIME2, AutoArchive BIT, AutoArchiveAt DATETIME2, PublishedAt DATETIME2, CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #r EXEC dbo.usp_GetAnnouncementById @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UserId = '00000000-0000-4000-8000-0000000000ff';

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @cnt;
END;
GO

-- ── usp_CreateAnnouncement ───────────────────────────────────────────────────
CREATE PROCEDURE AnnouncementsTests.[test_CreatePublishedStampsLifecycle]
AS
BEGIN
    DECLARE @NewId UNIQUEIDENTIFIER;
    EXEC dbo.usp_CreateAnnouncement
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @AuthorUserId = '00000000-0000-4000-8000-0000000000aa',
        @Title = N'Live now', @Body = N'Details', @Audience = N'{"kind":"everyone"}',
        @Pinned = 0, @ExpiresOn = NULL, @Status = N'Published', @ScheduledPublishAt = NULL,
        @AutoArchive = 1, @CreatedBy = N'aa', @AnnouncementId = @NewId OUTPUT;

    -- FakeTable strips the AnnouncementId default, so the OUTPUT id is NULL under fake — query by Title.
    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE Title = N'Live now');
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = @st;

    DECLARE @pub NVARCHAR(10) = CASE WHEN (SELECT PublishedAt FROM dbo.Announcements WHERE Title = N'Live now') IS NOT NULL THEN N'set' ELSE N'null' END;
    EXEC tSQLt.AssertEqualsString @Expected = N'set', @Actual = @pub;

    DECLARE @dd INT = (SELECT DATEDIFF(DAY, PublishedAt, AutoArchiveAt) FROM dbo.Announcements WHERE Title = N'Live now');
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @dd;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_CreateScheduledHoldsWithoutPublishing]
AS
BEGIN
    DECLARE @NewId UNIQUEIDENTIFIER;
    EXEC dbo.usp_CreateAnnouncement
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @AuthorUserId = '00000000-0000-4000-8000-0000000000aa',
        @Title = N'Later', @Body = N'Details', @Audience = N'{"kind":"everyone"}',
        @Pinned = 0, @ExpiresOn = NULL, @Status = N'Scheduled', @ScheduledPublishAt = '2999-01-01T09:00:00',
        @AutoArchive = 1, @CreatedBy = N'aa', @AnnouncementId = @NewId OUTPUT;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE Title = N'Later');
    EXEC tSQLt.AssertEquals @Expected = N'Scheduled', @Actual = @st;

    DECLARE @pub NVARCHAR(10) = CASE WHEN (SELECT PublishedAt FROM dbo.Announcements WHERE Title = N'Later') IS NULL THEN N'null' ELSE N'set' END;
    EXEC tSQLt.AssertEqualsString @Expected = N'null', @Actual = @pub;

    DECLARE @sch NVARCHAR(10) = CASE WHEN (SELECT ScheduledPublishAt FROM dbo.Announcements WHERE Title = N'Later') IS NOT NULL THEN N'set' ELSE N'null' END;
    EXEC tSQLt.AssertEqualsString @Expected = N'set', @Actual = @sch;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_CreateStoresChosenAuthor]
AS
BEGIN
    DECLARE @NewId UNIQUEIDENTIFIER;
    EXEC dbo.usp_CreateAnnouncement
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @AuthorUserId = '00000000-0000-4000-8000-0000000000be',
        @Title = N'By proxy', @Body = N'Details', @Audience = N'{"kind":"everyone"}',
        @Pinned = 0, @ExpiresOn = NULL, @Status = N'Published', @ScheduledPublishAt = NULL,
        @AutoArchive = 1, @CreatedBy = N'ad', @AnnouncementId = @NewId OUTPUT;

    -- @Expected must be UNIQUEIDENTIFIER too (SQL Server returns GUIDs upper-case; a string literal
    -- would fail the case-sensitive sql_variant comparison). Query by Title (FakeTable strips the id default).
    DECLARE @expAuthor UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000be';
    DECLARE @author UNIQUEIDENTIFIER = (SELECT AuthorUserId FROM dbo.Announcements WHERE Title = N'By proxy');
    EXEC tSQLt.AssertEquals @Expected = @expAuthor, @Actual = @author;

    DECLARE @cb NVARCHAR(256) = (SELECT CreatedBy FROM dbo.Announcements WHERE Title = N'By proxy');
    EXEC tSQLt.AssertEqualsString @Expected = N'ad', @Actual = @cb;
END;
GO

-- ── usp_QueryAnnouncementsForManage ──────────────────────────────────────────
CREATE PROCEDURE AnnouncementsTests.[test_ManageReturnsAllStatusesWithAuthorName]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Scheduled', @Audience = N'{"kind":"everyone"}', @ScheduledPublishAt = '2999-01-01T00:00:00', @Title = N'S';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000002', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00', @Title = N'P';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000003', @Status = N'Archived',  @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-06-01T00:00:00', @Title = N'A';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280), Pinned BIT,
        PublishedAt DATETIME2, ScheduledPublishAt DATETIME2, AutoArchive BIT, AutoArchiveAt DATETIME2, Status NVARCHAR(16),
        AuthorUserId UNIQUEIDENTIFIER, AuthorName NVARCHAR(200), PostedAt DATETIME2, TotalCount INT);
    INSERT INTO #r EXEC dbo.usp_QueryAnnouncementsForManage @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @Page = 1, @PageSize = 20;

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @cnt;

    DECLARE @nm NVARCHAR(200) = (SELECT TOP 1 AuthorName FROM #r WHERE Title = N'P');
    EXEC tSQLt.AssertEquals @Expected = N'Ann Author', @Actual = @nm;

    DECLARE @posted NVARCHAR(10) = CASE WHEN (SELECT PostedAt FROM #r WHERE Title = N'S') IS NOT NULL THEN N'set' ELSE N'null' END;
    EXEC tSQLt.AssertEqualsString @Expected = N'set', @Actual = @posted;
END;
GO

-- ── usp_QueryAnnouncements (consumer feed) ───────────────────────────────────
CREATE PROCEDURE AnnouncementsTests.[test_QueryReturnsPublishedInAudienceOnly]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00', @Title = N'Live';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000002', @Status = N'Scheduled', @Audience = N'{"kind":"everyone"}', @ScheduledPublishAt = '2999-01-01T00:00:00', @Title = N'Sched';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000003', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @ExpiresOn = '2020-01-01', @PublishedAt = '2019-12-01T00:00:00', @Title = N'Expired';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280), Pinned BIT,
        PublishedAt DATETIME2, ScheduledPublishAt DATETIME2, AutoArchive BIT, AutoArchiveAt DATETIME2, Status NVARCHAR(16),
        AuthorUserId UNIQUEIDENTIFIER, AuthorName NVARCHAR(200), PostedAt DATETIME2, TotalCount INT);
    INSERT INTO #r EXEC dbo.usp_QueryAnnouncements @UserId = '00000000-0000-4000-8000-0000000000be', @Page = 1, @PageSize = 20;

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @cnt;

    DECLARE @title NVARCHAR(200) = (SELECT TOP 1 Title FROM #r);
    EXEC tSQLt.AssertEquals @Expected = N'Live', @Actual = @title;

    DECLARE @nm NVARCHAR(200) = (SELECT TOP 1 AuthorName FROM #r);
    EXEC tSQLt.AssertEquals @Expected = N'Ann Author', @Actual = @nm;
END;
GO

-- ── usp_PublishAnnouncement ──────────────────────────────────────────────────
CREATE PROCEDURE AnnouncementsTests.[test_PublishScheduledPublishesNow]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Scheduled',
        @Audience = N'{"kind":"everyone"}', @ScheduledPublishAt = '2999-01-01T00:00:00';

    DECLARE @Found BIT, @Newly BIT, @Ws UNIQUEIDENTIFIER;
    EXEC dbo.usp_PublishAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UpdatedBy = N'aa',
        @Found = @Found OUTPUT, @NewlyPublished = @Newly OUTPUT, @WorkspaceId = @Ws OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Newly;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = @st;

    DECLARE @aa NVARCHAR(10) = CASE WHEN (SELECT AutoArchiveAt FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001') IS NOT NULL THEN N'set' ELSE N'null' END;
    EXEC tSQLt.AssertEqualsString @Expected = N'set', @Actual = @aa;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_PublishIsIdempotentSecondTime]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00';

    DECLARE @Found BIT, @Newly BIT, @Ws UNIQUEIDENTIFIER;
    EXEC dbo.usp_PublishAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UpdatedBy = N'aa',
        @Found = @Found OUTPUT, @NewlyPublished = @Newly OUTPUT, @WorkspaceId = @Ws OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Newly;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_PublishArchivedIsBlocked]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Archived', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-06-01T00:00:00';

    DECLARE @Found BIT, @Newly BIT, @Ws UNIQUEIDENTIFIER;
    EXEC dbo.usp_PublishAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UpdatedBy = N'aa',
        @Found = @Found OUTPUT, @NewlyPublished = @Newly OUTPUT, @WorkspaceId = @Ws OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Found;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Archived', @Actual = @st;
END;
GO

-- ── usp_RetireAnnouncement (Archive now) ─────────────────────────────────────
CREATE PROCEDURE AnnouncementsTests.[test_RetireSetsArchived]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00';

    DECLARE @Found BIT;
    EXEC dbo.usp_RetireAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UpdatedBy = N'aa', @Found = @Found OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Archived', @Actual = @st;
END;
GO

-- ── usp_UpdateAnnouncement ───────────────────────────────────────────────────
CREATE PROCEDURE AnnouncementsTests.[test_UpdateReplacesFieldsAndAuthor]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00', @Title = N'Old';

    DECLARE @Found BIT;
    EXEC dbo.usp_UpdateAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001',
        @Title = N'New', @Body = N'B2', @Audience = N'{"kind":"everyone"}', @Pinned = 1,
        @AuthorUserId = '00000000-0000-4000-8000-0000000000be', @Status = N'Published', @ScheduledPublishAt = NULL,
        @AutoArchive = 1, @ExpiresOn = NULL, @UpdatedBy = N'aa', @Found = @Found OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;

    DECLARE @title NVARCHAR(200) = (SELECT Title FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'New', @Actual = @title;

    DECLARE @pin BIT = (SELECT Pinned FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @pin;

    DECLARE @expAuthor UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000be';
    DECLARE @author UNIQUEIDENTIFIER = (SELECT AuthorUserId FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = @expAuthor, @Actual = @author;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_UpdateScheduledToPublishedPublishesNow]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Scheduled',
        @Audience = N'{"kind":"everyone"}', @ScheduledPublishAt = '2999-01-01T00:00:00', @Title = N'S';

    DECLARE @Found BIT;
    EXEC dbo.usp_UpdateAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001',
        @Title = N'S', @Body = N'B', @Audience = N'{"kind":"everyone"}', @Pinned = 0,
        @AuthorUserId = '00000000-0000-4000-8000-0000000000aa', @Status = N'Published', @ScheduledPublishAt = NULL,
        @AutoArchive = 1, @ExpiresOn = NULL, @UpdatedBy = N'aa', @Found = @Found OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = @st;

    DECLARE @pub NVARCHAR(10) = CASE WHEN (SELECT PublishedAt FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001') IS NOT NULL THEN N'set' ELSE N'null' END;
    EXEC tSQLt.AssertEqualsString @Expected = N'set', @Actual = @pub;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_UpdateArchivedIsBlocked]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Archived',
        @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-06-01T00:00:00', @Title = N'Frozen';

    DECLARE @Found BIT;
    EXEC dbo.usp_UpdateAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001',
        @Title = N'Changed', @Body = N'B', @Audience = N'{"kind":"everyone"}', @Pinned = 0,
        @AuthorUserId = '00000000-0000-4000-8000-0000000000aa', @Status = N'Published', @ScheduledPublishAt = NULL,
        @AutoArchive = 1, @ExpiresOn = NULL, @UpdatedBy = N'aa', @Found = @Found OUTPUT;

    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Found;

    DECLARE @title NVARCHAR(200) = (SELECT Title FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Frozen', @Actual = @title;
END;
GO

-- ── usp_TickAnnouncements ────────────────────────────────────────────────────
CREATE PROCEDURE AnnouncementsTests.[test_TickPublishesDueScheduled]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Scheduled',
        @Audience = N'{"kind":"everyone"}', @ScheduledPublishAt = '2020-01-01T09:00:00';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER);
    INSERT INTO #r EXEC dbo.usp_TickAnnouncements;

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @cnt;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = @st;

    DECLARE @dd INT = (SELECT DATEDIFF(DAY, PublishedAt, AutoArchiveAt) FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = 30, @Actual = @dd;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_TickLeavesFutureScheduled]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Scheduled',
        @Audience = N'{"kind":"everyone"}', @ScheduledPublishAt = '2999-01-01T09:00:00';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER);
    INSERT INTO #r EXEC dbo.usp_TickAnnouncements;

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @cnt;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Scheduled', @Actual = @st;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_TickArchivesDuePublished]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published',
        @Audience = N'{"kind":"everyone"}', @PublishedAt = '2020-01-01T00:00:00', @AutoArchive = 1, @AutoArchiveAt = '2020-01-31T00:00:00';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER);
    INSERT INTO #r EXEC dbo.usp_TickAnnouncements;

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @cnt;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Archived', @Actual = @st;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_TickNoOpWhenNothingDue]
AS
BEGIN
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published',
        @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00', @AutoArchive = 1, @AutoArchiveAt = '2999-01-01T00:00:00';

    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER);
    INSERT INTO #r EXEC dbo.usp_TickAnnouncements;

    DECLARE @cnt INT = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @cnt;

    DECLARE @st NVARCHAR(16) = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = @st;
END;
GO
