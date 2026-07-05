-- =============================================
-- tSQLt tests for the Notifications read/mark procs (Slice 12).
-- Covers: usp_QueryNotifications (caller-scoped, newest-first, unreadOnly filter, windowed TotalCount),
--         usp_GetUnreadCount, usp_MarkNotificationRead (own → @Found 1 + read; other's → @Found 0,
--         no write — the API turns this into 403), usp_MarkAllNotificationsRead (idempotent).
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'NotificationsTests';
GO

CREATE PROCEDURE NotificationsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Notifications';

    -- aa has 2 notifications (one read, one unread); bb has 1 unread (must never surface for aa).
    INSERT INTO dbo.Notifications (NotificationId, UserId, WorkspaceId, RecordId, Category, Summary, SourceEventId, ReadAt, CreatedAt, UpdatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
      ('AA000001-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'gate-decided', N'A gate decision was recorded on AIS-00000001', NEWID(), NULL,        '2026-07-05T10:00:00', '2026-07-05T10:00:00', 0, N's', N's'),
      ('AA000002-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', '1A150000-0000-4000-8000-000000000001', N'AIS-00000002', N'closed',       N'AIS-00000002 was closed',                     NEWID(), '2026-07-04', '2026-07-05T09:00:00', '2026-07-05T09:00:00', 0, N's', N's'),
      ('BB000001-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000bb', '1A150000-0000-4000-8000-000000000001', N'AIS-00000003', N'mentioned',    N'You were mentioned on AIS-00000003',          NEWID(), NULL,        '2026-07-05T11:00:00', '2026-07-05T11:00:00', 0, N's', N's');
END;
GO

CREATE PROCEDURE NotificationsTests.[test_QueryReturnsCallerRowsNewestFirstWithTotalCount]
AS
BEGIN
    -- Act — page all of aa's notifications.
    CREATE TABLE #N (NotificationId UNIQUEIDENTIFIER, Category NVARCHAR(32), RecordId NVARCHAR(20),
        Summary NVARCHAR(400), SourceEventId UNIQUEIDENTIFIER, CreatedAt DATETIME2, ReadAt DATETIME2, TotalCount INT);
    INSERT INTO #N EXEC dbo.usp_QueryNotifications @UserId = '00000000-0000-4000-8000-0000000000aa', @Page = 1, @PageSize = 20, @UnreadOnly = 0;

    -- Assert — aa's 2 rows only (bb's excluded), newest first, TotalCount = 2.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #N);
    DECLARE @First NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #N ORDER BY CreatedAt DESC);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @First;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT TOP 1 TotalCount FROM #N);
END;
GO

CREATE PROCEDURE NotificationsTests.[test_QueryUnreadOnlyFiltersReadRows]
AS
BEGIN
    -- Act
    CREATE TABLE #N (NotificationId UNIQUEIDENTIFIER, Category NVARCHAR(32), RecordId NVARCHAR(20),
        Summary NVARCHAR(400), SourceEventId UNIQUEIDENTIFIER, CreatedAt DATETIME2, ReadAt DATETIME2, TotalCount INT);
    INSERT INTO #N EXEC dbo.usp_QueryNotifications @UserId = '00000000-0000-4000-8000-0000000000aa', @Page = 1, @PageSize = 20, @UnreadOnly = 1;

    -- Assert — only the single unread row.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #N);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = (SELECT TOP 1 RecordId FROM #N);
END;
GO

CREATE PROCEDURE NotificationsTests.[test_UnreadCountCountsOnlyCallerUnread]
AS
BEGIN
    -- Act
    DECLARE @Count INT;
    CREATE TABLE #C (UnreadCount INT);
    INSERT INTO #C EXEC dbo.usp_GetUnreadCount @UserId = '00000000-0000-4000-8000-0000000000aa';
    SET @Count = (SELECT TOP 1 UnreadCount FROM #C);

    -- Assert — aa has exactly one unread (bb's does not count).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE NotificationsTests.[test_MarkReadOwnRowSetsReadAt]
AS
BEGIN
    -- Act
    DECLARE @Found BIT;
    EXEC dbo.usp_MarkNotificationRead @NotificationId = 'AA000001-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Found = @Found OUTPUT;

    -- Assert — found + now read.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Found;
    DECLARE @Unread INT = (SELECT COUNT(*) FROM dbo.Notifications WHERE NotificationId = 'AA000001-0000-4000-8000-000000000001' AND ReadAt IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Unread;
END;
GO

CREATE PROCEDURE NotificationsTests.[test_MarkReadOthersRowReturnsNotFoundAndDoesNotWrite]
AS
BEGIN
    -- Act — aa tries to mark bb's notification read.
    DECLARE @Found BIT;
    EXEC dbo.usp_MarkNotificationRead @NotificationId = 'BB000001-0000-4000-8000-000000000003',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Found = @Found OUTPUT;

    -- Assert — @Found 0 (API → 403), and bb's row is untouched (still unread).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Found;
    DECLARE @Unread INT = (SELECT COUNT(*) FROM dbo.Notifications WHERE NotificationId = 'BB000001-0000-4000-8000-000000000003' AND ReadAt IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Unread;
END;
GO

CREATE PROCEDURE NotificationsTests.[test_MarkAllReadClearsCallerUnreadOnly]
AS
BEGIN
    -- Act
    EXEC dbo.usp_MarkAllNotificationsRead @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — aa has no unread left; bb's unread is untouched.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM dbo.Notifications WHERE UserId = '00000000-0000-4000-8000-0000000000aa' AND ReadAt IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications WHERE UserId = '00000000-0000-4000-8000-0000000000bb' AND ReadAt IS NULL);
END;
GO
