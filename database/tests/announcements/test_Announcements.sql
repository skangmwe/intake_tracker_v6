-- =============================================
-- tSQLt tests for the Announcements procs (Slice 13). Covers:
--   usp_CreateAnnouncement          — inserts a Draft with the given fields
--   usp_GetAnnouncementById         — author/admin see any status; a member sees a Published in-audience
--                                     announcement; a non-audience member and an expired announcement are
--                                     hidden (0 rows → API 403, never disclosing existence, BS §22.6)
--   usp_QueryAnnouncements          — the caller's Published, un-expired, in-audience history only
--   usp_QueryAnnouncementsForManage — every status in the workspace; expired-Published collapses to Retired
--   usp_UpdateAnnouncement          — replaces editable fields; a Retired row is immutable (@Found = 0)
--   usp_PublishAnnouncement         — Draft→Published (idempotent; @NewlyPublished only on the transition);
--                                     a Retired row cannot publish (@Found = 0)
--   usp_RetireAnnouncement          — Status→Retired, idempotent
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'AnnouncementsTests';
GO

CREATE PROCEDURE AnnouncementsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Announcements';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';

    -- WS1 members: author aa, admin adm, plain member mem, role-holder rol. Outsider out is NOT a member.
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000ad', N'WorkspaceAdmin', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000be', N'Member', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c0', N'Member', 0);
    -- rol holds the 'Manager' role label in WS1.
    INSERT INTO dbo.ApproverTeamMembership (WorkspaceId, RoleLabel, UserId, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'Manager', '00000000-0000-4000-8000-0000000000c0', 0);
END;
GO

-- A helper to insert an announcement row directly (FakeTable strips the identity default, so supply the id).
CREATE PROCEDURE AnnouncementsTests.[InsertAnnouncement]
    @Id UNIQUEIDENTIFIER, @Status NVARCHAR(16), @Audience NVARCHAR(MAX),
    @Pinned BIT = 0, @ExpiresOn DATE = NULL, @PublishedAt DATETIME2 = NULL, @Title NVARCHAR(200) = N'Notice'
AS
BEGIN
    INSERT INTO dbo.Announcements
        (AnnouncementId, WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, ExpiresOn, Status,
         PublishedAt, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES
        (@Id, '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', @Title, N'Body',
         @Audience, @Pinned, @ExpiresOn, @Status, @PublishedAt, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's', 0);
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_CreateInsertsDraft]
AS
BEGIN
    -- Act
    DECLARE @NewId UNIQUEIDENTIFIER;
    EXEC dbo.usp_CreateAnnouncement
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @AuthorUserId = '00000000-0000-4000-8000-0000000000aa',
        @Title = N'Coverage change', @Body = N'Details', @Audience = N'{"kind":"everyone"}',
        @Pinned = 1, @ExpiresOn = NULL, @CreatedBy = N'aa', @AnnouncementId = @NewId OUTPUT;

    -- Assert — one Draft row with the given fields.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Announcements WHERE Title = N'Coverage change' AND Status = N'Draft' AND Pinned = 1);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_GetByIdAuthorSeesDraft]
AS
BEGIN
    -- Arrange — a Draft authored by aa.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Draft', @Audience = N'{"kind":"everyone"}';

    -- Act / Assert — the author sees the Draft.
    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER,
        Title NVARCHAR(200), Body NVARCHAR(MAX), Audience NVARCHAR(MAX), Pinned BIT, ExpiresOn DATE,
        Status NVARCHAR(16), PublishedAt DATETIME2, CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #r EXEC dbo.usp_GetAnnouncementById @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UserId = '00000000-0000-4000-8000-0000000000aa';
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #r);
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_GetByIdAdminSeesDraft]
AS
BEGIN
    -- Arrange — a Draft authored by aa; adm is a workspace admin (not the author).
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Draft', @Audience = N'{"kind":"everyone"}';

    -- Act / Assert
    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER,
        Title NVARCHAR(200), Body NVARCHAR(MAX), Audience NVARCHAR(MAX), Pinned BIT, ExpiresOn DATE,
        Status NVARCHAR(16), PublishedAt DATETIME2, CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #r EXEC dbo.usp_GetAnnouncementById @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UserId = '00000000-0000-4000-8000-0000000000ad';
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #r);
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_GetByIdMemberDeniedForDraft]
AS
BEGIN
    -- Arrange — a Draft; mem is a plain member (not author, not admin).
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Draft', @Audience = N'{"kind":"everyone"}';

    -- Act / Assert — a plain member cannot see a Draft.
    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER,
        Title NVARCHAR(200), Body NVARCHAR(MAX), Audience NVARCHAR(MAX), Pinned BIT, ExpiresOn DATE,
        Status NVARCHAR(16), PublishedAt DATETIME2, CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #r EXEC dbo.usp_GetAnnouncementById @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UserId = '00000000-0000-4000-8000-0000000000be';
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #r);
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_GetByIdOutsiderDeniedForPublished]
AS
BEGIN
    -- Arrange — a Published everyone announcement; 'out' is NOT a member of the workspace.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published',
        @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00';

    -- Act / Assert — a non-member sees nothing even for an "everyone" Published announcement.
    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER,
        Title NVARCHAR(200), Body NVARCHAR(MAX), Audience NVARCHAR(MAX), Pinned BIT, ExpiresOn DATE,
        Status NVARCHAR(16), PublishedAt DATETIME2, CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #r EXEC dbo.usp_GetAnnouncementById @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UserId = '00000000-0000-4000-8000-0000000000ff';
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #r);
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_GetByIdExpiredHiddenFromMember]
AS
BEGIN
    -- Arrange — a Published announcement whose ExpiresOn is in the past.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published',
        @Audience = N'{"kind":"everyone"}', @ExpiresOn = '2020-01-01', @PublishedAt = '2019-12-01T00:00:00';

    -- Act / Assert — an expired Published announcement is hidden from a plain member (treated as Retired, §20).
    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, AuthorUserId UNIQUEIDENTIFIER,
        Title NVARCHAR(200), Body NVARCHAR(MAX), Audience NVARCHAR(MAX), Pinned BIT, ExpiresOn DATE,
        Status NVARCHAR(16), PublishedAt DATETIME2, CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #r EXEC dbo.usp_GetAnnouncementById @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UserId = '00000000-0000-4000-8000-0000000000be';
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #r);
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_QueryReturnsPublishedInAudienceOnly]
AS
BEGIN
    -- Arrange — one live Published everyone (visible); plus a Draft, a Retired, and an expired (all hidden).
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00', @Title = N'Live';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000002', @Status = N'Draft',     @Audience = N'{"kind":"everyone"}', @Title = N'Draft';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000003', @Status = N'Retired',   @Audience = N'{"kind":"everyone"}', @Title = N'Retired';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000004', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @ExpiresOn = '2020-01-01', @PublishedAt = '2019-12-01T00:00:00', @Title = N'Expired';

    -- Act — the plain member queries their history.
    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280), Pinned BIT,
        PublishedAt DATETIME2, Status NVARCHAR(16), AuthorUserId UNIQUEIDENTIFIER, TotalCount INT);
    INSERT INTO #r EXEC dbo.usp_QueryAnnouncements @UserId = '00000000-0000-4000-8000-0000000000be', @Page = 1, @PageSize = 20;

    -- Assert — only the one live in-audience Published row.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = N'Live', @Actual = (SELECT TOP 1 Title FROM #r);
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_QueryRoleScopedMatchesRoleHolderOnly]
AS
BEGIN
    -- Arrange — a Published role-scoped (Manager) announcement. rol holds Manager; mem does not.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published',
        @Audience = N'{"kind":"role-scoped","roleLabels":["Manager"]}', @PublishedAt = '2026-07-01T00:00:00', @Title = N'ForManagers';

    -- Act / Assert — the role holder sees it; the non-holder does not.
    CREATE TABLE #rol (AnnouncementId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280), Pinned BIT,
        PublishedAt DATETIME2, Status NVARCHAR(16), AuthorUserId UNIQUEIDENTIFIER, TotalCount INT);
    INSERT INTO #rol EXEC dbo.usp_QueryAnnouncements @UserId = '00000000-0000-4000-8000-0000000000c0', @Page = 1, @PageSize = 20;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #rol);

    CREATE TABLE #mem (AnnouncementId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280), Pinned BIT,
        PublishedAt DATETIME2, Status NVARCHAR(16), AuthorUserId UNIQUEIDENTIFIER, TotalCount INT);
    INSERT INTO #mem EXEC dbo.usp_QueryAnnouncements @UserId = '00000000-0000-4000-8000-0000000000be', @Page = 1, @PageSize = 20;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #mem);
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_ManageReturnsAllStatusesAndCollapsesExpired]
AS
BEGIN
    -- Arrange — a Draft, a Published, a Retired, and an expired-Published in WS1.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Draft',     @Audience = N'{"kind":"everyone"}', @Title = N'D';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000002', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00', @Title = N'P';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000003', @Status = N'Retired',   @Audience = N'{"kind":"everyone"}', @Title = N'R';
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000004', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @ExpiresOn = '2020-01-01', @PublishedAt = '2019-12-01T00:00:00', @Title = N'X';

    -- Act
    CREATE TABLE #r (AnnouncementId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280), Pinned BIT,
        PublishedAt DATETIME2, Status NVARCHAR(16), AuthorUserId UNIQUEIDENTIFIER, TotalCount INT);
    INSERT INTO #r EXEC dbo.usp_QueryAnnouncementsForManage @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @Page = 1, @PageSize = 20;

    -- Assert — all four rows; the expired-Published shows effective status Retired.
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = (SELECT COUNT(*) FROM #r);
    EXEC tSQLt.AssertEquals @Expected = N'Retired', @Actual = (SELECT Status FROM #r WHERE Title = N'X');
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_PublishTransitionsDraftOnce]
AS
BEGIN
    -- Arrange — a Draft.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Draft', @Audience = N'{"kind":"everyone"}';

    -- Act — publish it.
    DECLARE @Found BIT, @Newly BIT, @Ws UNIQUEIDENTIFIER;
    EXEC dbo.usp_PublishAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UpdatedBy = N'aa',
        @Found = @Found OUTPUT, @NewlyPublished = @Newly OUTPUT, @WorkspaceId = @Ws OUTPUT;

    -- Assert — found + newly published, status flipped, workspace returned, PublishedAt set.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Newly;
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = '1A150000-0000-4000-8000-000000000001', @Actual = @Ws;
    EXEC tSQLt.AssertEqualsString @Expected = N'set', @Actual = CASE WHEN (SELECT PublishedAt FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001') IS NOT NULL THEN N'set' ELSE N'null' END;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_PublishIsIdempotentSecondTime]
AS
BEGIN
    -- Arrange — an already-Published announcement.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00';

    -- Act — publish again.
    DECLARE @Found BIT, @Newly BIT, @Ws UNIQUEIDENTIFIER;
    EXEC dbo.usp_PublishAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UpdatedBy = N'aa',
        @Found = @Found OUTPUT, @NewlyPublished = @Newly OUTPUT, @WorkspaceId = @Ws OUTPUT;

    -- Assert — found but NOT newly published (no re-fan); status unchanged.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Newly;
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_PublishRetiredIsBlocked]
AS
BEGIN
    -- Arrange — a Retired announcement.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Retired', @Audience = N'{"kind":"everyone"}';

    -- Act
    DECLARE @Found BIT, @Newly BIT, @Ws UNIQUEIDENTIFIER;
    EXEC dbo.usp_PublishAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UpdatedBy = N'aa',
        @Found = @Found OUTPUT, @NewlyPublished = @Newly OUTPUT, @WorkspaceId = @Ws OUTPUT;

    -- Assert — not found (a Retired row cannot publish); stays Retired.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = N'Retired', @Actual = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_RetireSetsRetired]
AS
BEGIN
    -- Arrange — a Published announcement.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Published', @Audience = N'{"kind":"everyone"}', @PublishedAt = '2026-07-01T00:00:00';

    -- Act
    DECLARE @Found BIT;
    EXEC dbo.usp_RetireAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001', @UpdatedBy = N'aa', @Found = @Found OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = N'Retired', @Actual = (SELECT Status FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_UpdateReplacesEditableFields]
AS
BEGIN
    -- Arrange — a Draft.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Draft', @Audience = N'{"kind":"everyone"}', @Title = N'Old';

    -- Act
    DECLARE @Found BIT;
    EXEC dbo.usp_UpdateAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001',
        @Title = N'New', @Body = N'B2', @Audience = N'{"kind":"named-users","userIds":[]}', @Pinned = 1, @ExpiresOn = NULL,
        @UpdatedBy = N'aa', @Found = @Found OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = N'New', @Actual = (SELECT Title FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT Pinned FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
END;
GO

CREATE PROCEDURE AnnouncementsTests.[test_UpdateRetiredIsBlocked]
AS
BEGIN
    -- Arrange — a Retired announcement.
    EXEC AnnouncementsTests.InsertAnnouncement @Id = '0A000000-0000-4000-8000-000000000001', @Status = N'Retired', @Audience = N'{"kind":"everyone"}', @Title = N'Frozen';

    -- Act
    DECLARE @Found BIT;
    EXEC dbo.usp_UpdateAnnouncement @AnnouncementId = '0A000000-0000-4000-8000-000000000001',
        @Title = N'Changed', @Body = N'B', @Audience = N'{"kind":"everyone"}', @Pinned = 0, @ExpiresOn = NULL,
        @UpdatedBy = N'aa', @Found = @Found OUTPUT;

    -- Assert — no update on a Retired row (edit until Retired, §20).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Found;
    EXEC tSQLt.AssertEquals @Expected = N'Frozen', @Actual = (SELECT Title FROM dbo.Announcements WHERE AnnouncementId = '0A000000-0000-4000-8000-000000000001');
END;
GO
