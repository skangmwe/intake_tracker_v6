-- =============================================
-- tSQLt tests for the Watchers procs (Slice 12).
-- Covers: usp_AddWatcher (member subscribes / non-member denied → no row / idempotent reactivate of
--         a soft-cleared row, never a duplicate), usp_RemoveWatcher (soft clear, idempotent),
--         usp_GetWatchers (member sees live watchers with DisplayName / unsubscribed excluded /
--         non-member sees nothing). Access is baked into every proc via a WorkspaceMembership join,
--         so a forbidden or non-existent record is indistinguishable from empty (API answers 403).
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'WatchersTests';
GO

CREATE PROCEDURE WatchersTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Watchers';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{}', 0, N'seed', N'seed');
    -- aa is a member; cc is not.
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.Users (UserId, DisplayName, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ana Analyst', 0, 0);
END;
GO

CREATE PROCEDURE WatchersTests.[test_AddSubscribesMember]
AS
BEGIN
    -- Act
    EXEC dbo.usp_AddWatcher
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @TargetUserId = '00000000-0000-4000-8000-0000000000aa',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — exactly one live subscription for aa.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Watchers
        WHERE RecordId = N'AIS-00000001' AND UserId = '00000000-0000-4000-8000-0000000000aa'
          AND UnsubscribedAt IS NULL AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE WatchersTests.[test_AddDeniedForNonMember]
AS
BEGIN
    -- Act — cc is not a member of the record's workspace.
    EXEC dbo.usp_AddWatcher
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @TargetUserId = '00000000-0000-4000-8000-0000000000cc',
        @ActorUserId = '00000000-0000-4000-8000-0000000000cc';

    -- Assert — no subscription written.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Watchers);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE WatchersTests.[test_AddIsIdempotentReactivate]
AS
BEGIN
    -- Arrange — a soft-cleared (previously unsubscribed) row for aa.
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, UnsubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('99999999-9999-4999-8999-999999999999', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-0000000000aa', '2026-01-01', '2026-02-01', 0, N'aa', N'aa');

    -- Act — subscribing again reactivates the same row.
    EXEC dbo.usp_AddWatcher
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @TargetUserId = '00000000-0000-4000-8000-0000000000aa',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — still one row total (reactivated, not duplicated), now live.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Watchers);
    DECLARE @Live INT = (SELECT COUNT(*) FROM dbo.Watchers WHERE UnsubscribedAt IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Live;
END;
GO

CREATE PROCEDURE WatchersTests.[test_RemoveSoftClears]
AS
BEGIN
    -- Arrange — aa is watching.
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-0000000000aa', SYSUTCDATETIME(), 0, N'aa', N'aa');

    -- Act
    EXEC dbo.usp_RemoveWatcher
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @TargetUserId = '00000000-0000-4000-8000-0000000000aa',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — row retained, UnsubscribedAt set (soft clear, not a delete).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Watchers);
    DECLARE @Live INT = (SELECT COUNT(*) FROM dbo.Watchers WHERE UnsubscribedAt IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Live;
END;
GO

CREATE PROCEDURE WatchersTests.[test_GetReturnsLiveWithNameExcludesUnsubscribed]
AS
BEGIN
    -- Arrange — aa watching (live), bb unsubscribed.
    INSERT INTO dbo.Users (UserId, DisplayName, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000bb', N'Ben Builder', 0, 0);
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, UnsubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', SYSUTCDATETIME(), NULL, 0, N'aa', N'aa'),
           (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), SYSUTCDATETIME(), 0, N'bb', N'bb');

    -- Act
    CREATE TABLE #W (UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(256), SubscribedAt DATETIME2);
    INSERT INTO #W EXEC dbo.usp_GetWatchers
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — only the live watcher, with a resolved DisplayName.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #W);
    DECLARE @Name NVARCHAR(256) = (SELECT TOP 1 DisplayName FROM #W);
    EXEC tSQLt.AssertEquals @Expected = N'Ana Analyst', @Actual = @Name;
END;
GO

CREATE PROCEDURE WatchersTests.[test_GetDeniedForNonMember]
AS
BEGIN
    -- Arrange — aa is watching, but cc (non-member) asks.
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-0000000000aa', SYSUTCDATETIME(), 0, N'aa', N'aa');

    -- Act
    CREATE TABLE #W (UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(256), SubscribedAt DATETIME2);
    INSERT INTO #W EXEC dbo.usp_GetWatchers
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000cc';

    -- Assert — a non-member sees nothing (the API turns empty into 403).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #W);
END;
GO
