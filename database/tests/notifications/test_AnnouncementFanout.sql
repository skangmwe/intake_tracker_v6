-- =============================================
-- tSQLt tests for the announcement.published branch of usp_FanOutNotification (Slice 13).
-- Covers audience resolution (everyone / named-users / role-scoped), the AnnouncementId deep-link +
-- Title-bearing summary on each row, actor exclusion, disabled-account suppression, and idempotency.
-- A separate test class from NotificationFanoutTests so the slice-12 tests stay untouched.
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'AnnouncementFanoutTests';
GO

CREATE PROCEDURE AnnouncementFanoutTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Announcements';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Notifications';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    -- WS1 members: aa (actor/author), bb (enabled), dd (disabled), cc (enabled, holds 'Manager').
    INSERT INTO dbo.Users (UserId, DisplayName, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ana', 0, 0),
           ('00000000-0000-4000-8000-0000000000bb', N'Ben', 0, 0),
           ('00000000-0000-4000-8000-0000000000cc', N'Cora', 0, 0),
           ('00000000-0000-4000-8000-0000000000dd', N'Dana', 1, 0);
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', N'Member', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000cc', N'Member', 0),
           ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000dd', N'Member', 0);
    INSERT INTO dbo.ApproverTeamMembership (WorkspaceId, RoleLabel, UserId, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'Manager', '00000000-0000-4000-8000-0000000000cc', 0);
END;
GO

CREATE PROCEDURE AnnouncementFanoutTests.[InsertAnn]
    @Audience NVARCHAR(MAX)
AS
BEGIN
    INSERT INTO dbo.Announcements
        (AnnouncementId, WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, Status, PublishedAt,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES
        ('0A000000-0000-4000-8000-0000000000f1', '1A150000-0000-4000-8000-000000000001',
         '00000000-0000-4000-8000-0000000000aa', N'Coverage news', N'Body', @Audience, 0, N'Published',
         SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's', 0);
END;
GO

CREATE PROCEDURE AnnouncementFanoutTests.[test_EveryoneFansToMembersExcludingActorAndDisabled]
AS
BEGIN
    -- Arrange — an "everyone" Published announcement in WS1.
    EXEC AnnouncementFanoutTests.InsertAnn @Audience = N'{"kind":"everyone"}';

    -- Act — aa (the author) publishes it.
    EXEC dbo.usp_FanOutNotification
        @EventId = '11111111-1111-4111-8111-1111111111f1', @EventType = N'announcement.published',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = NULL,
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa',
        @PayloadJson = N'{"announcementId":"0A000000-0000-4000-8000-0000000000f1"}', @EventAt = SYSUTCDATETIME();

    -- Assert — bb and cc are notified (aa is the actor; dd is disabled). Category + deep-link + title carry.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM dbo.Notifications);
    EXEC tSQLt.AssertEquals @Expected = N'announcement-posted', @Actual = (SELECT TOP 1 Category FROM dbo.Notifications);
    EXEC tSQLt.AssertEquals @Expected = '0A000000-0000-4000-8000-0000000000f1', @Actual = (SELECT TOP 1 AnnouncementId FROM dbo.Notifications);
    EXEC tSQLt.AssertEqualsString @Expected = N'New announcement: Coverage news', @Actual = (SELECT TOP 1 Summary FROM dbo.Notifications);
    -- RecordId stays NULL for an announcement row.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM dbo.Notifications WHERE RecordId IS NOT NULL);
END;
GO

CREATE PROCEDURE AnnouncementFanoutTests.[test_NamedUsersFansToListedMembersOnly]
AS
BEGIN
    -- Arrange — a named-users announcement targeting bb only.
    EXEC AnnouncementFanoutTests.InsertAnn @Audience = N'{"kind":"named-users","userIds":["00000000-0000-4000-8000-0000000000bb"]}';

    -- Act
    EXEC dbo.usp_FanOutNotification
        @EventId = '22222222-2222-4222-8222-2222222222f2', @EventType = N'announcement.published',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = NULL,
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa',
        @PayloadJson = N'{"announcementId":"0A000000-0000-4000-8000-0000000000f1"}', @EventAt = SYSUTCDATETIME();

    -- Assert — only bb.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications);
    EXEC tSQLt.AssertEquals @Expected = '00000000-0000-4000-8000-0000000000bb', @Actual = (SELECT TOP 1 UserId FROM dbo.Notifications);
END;
GO

CREATE PROCEDURE AnnouncementFanoutTests.[test_RoleScopedFansToRoleHoldersOnly]
AS
BEGIN
    -- Arrange — a role-scoped (Manager) announcement. cc holds Manager; bb does not.
    EXEC AnnouncementFanoutTests.InsertAnn @Audience = N'{"kind":"role-scoped","roleLabels":["Manager"]}';

    -- Act
    EXEC dbo.usp_FanOutNotification
        @EventId = '33333333-3333-4333-8333-3333333333f3', @EventType = N'announcement.published',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = NULL,
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa',
        @PayloadJson = N'{"announcementId":"0A000000-0000-4000-8000-0000000000f1"}', @EventAt = SYSUTCDATETIME();

    -- Assert — only cc (the Manager role holder).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications);
    EXEC tSQLt.AssertEquals @Expected = '00000000-0000-4000-8000-0000000000cc', @Actual = (SELECT TOP 1 UserId FROM dbo.Notifications);
END;
GO

CREATE PROCEDURE AnnouncementFanoutTests.[test_RedeliveredAnnouncementIsIdempotent]
AS
BEGIN
    -- Arrange — an everyone announcement.
    EXEC AnnouncementFanoutTests.InsertAnn @Audience = N'{"kind":"everyone"}';

    -- Act — the same event delivered twice.
    EXEC dbo.usp_FanOutNotification
        @EventId = '44444444-4444-4444-8444-4444444444f4', @EventType = N'announcement.published',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = NULL,
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa',
        @PayloadJson = N'{"announcementId":"0A000000-0000-4000-8000-0000000000f1"}', @EventAt = SYSUTCDATETIME();
    EXEC dbo.usp_FanOutNotification
        @EventId = '44444444-4444-4444-8444-4444444444f4', @EventType = N'announcement.published',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = NULL,
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa',
        @PayloadJson = N'{"announcementId":"0A000000-0000-4000-8000-0000000000f1"}', @EventAt = SYSUTCDATETIME();

    -- Assert — still exactly two rows (bb + cc), deduped on the source event.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM dbo.Notifications);
END;
GO
