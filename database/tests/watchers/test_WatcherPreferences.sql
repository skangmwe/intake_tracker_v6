-- =============================================
-- tSQLt tests for Slice 26 — per-record notification preferences.
-- Covers:
--   usp_UpsertWatcherPreference — first-write inserts with defaults + @Set mask; second
--                                 write updates only the flagged fields sparsely; access
--                                 gate blocks non-members (no row written).
--   usp_FanOutNotification preference filter — a target with a divergent pref for the
--                                 event's category is suppressed; a target with no pref
--                                 row is delivered (defaults are all 1).
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'WatcherPreferencesTests';
GO

CREATE PROCEDURE WatcherPreferencesTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WatcherNotificationPreference';

    -- Same shape as WatchersTests: aa is a member; cc is not.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues,
                              IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Test', N'intake', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
END;
GO

CREATE PROCEDURE WatcherPreferencesTests.[test_UpsertPreferenceInsertsFirstRowWithDefaultsAndMask]
AS
BEGIN
    -- Act — flip only NotifyGateDecisions to 0; the other four should land at their default 1.
    EXEC dbo.usp_UpsertWatcherPreference
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetNotifyGateDecisions = 1, @NotifyGateDecisions = 0,
        @SetNotifyStatusChanges = 0, @NotifyStatusChanges = 0,
        @SetNotifyTaskSignoffs = 0,  @NotifyTaskSignoffs = 0,
        @SetNotifySlaAndDueDateReminders = 0, @NotifySlaAndDueDateReminders = 0,
        @SetNotifyMentionsAndComments = 0,    @NotifyMentionsAndComments = 0;

    -- Assert — exactly one row; only the flagged pref diverges; the others are the default 1.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.WatcherNotificationPreference
        WHERE UserId = '00000000-0000-4000-8000-0000000000aa' AND RecordId = N'AIS-00000001'
          AND IsDeleted = 0);
    DECLARE @Gate BIT = (SELECT NotifyGateDecisions FROM dbo.WatcherNotificationPreference
        WHERE UserId = '00000000-0000-4000-8000-0000000000aa');
    DECLARE @Status BIT = (SELECT NotifyStatusChanges FROM dbo.WatcherNotificationPreference
        WHERE UserId = '00000000-0000-4000-8000-0000000000aa');
    DECLARE @Mentions BIT = (SELECT NotifyMentionsAndComments FROM dbo.WatcherNotificationPreference
        WHERE UserId = '00000000-0000-4000-8000-0000000000aa');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Gate;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Status;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Mentions;
END;
GO

CREATE PROCEDURE WatcherPreferencesTests.[test_UpsertPreferenceUpdatesInPlaceSparsely]
AS
BEGIN
    -- Arrange — an existing row, all defaults 1, plus one prior divergence on Mentions.
    INSERT INTO dbo.WatcherNotificationPreference
        (PreferenceId, UserId, RecordId, WorkspaceId,
         NotifyGateDecisions, NotifyStatusChanges, NotifyTaskSignoffs,
         NotifySlaAndDueDateReminders, NotifyMentionsAndComments,
         IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '00000000-0000-4000-8000-0000000000aa', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001',
            1, 1, 1, 1, 0, 0, N'seed', N'seed');

    -- Act — flip NotifyTaskSignoffs to 0; leave Mentions unset (must stay 0).
    EXEC dbo.usp_UpsertWatcherPreference
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetNotifyGateDecisions = 0, @NotifyGateDecisions = 0,
        @SetNotifyStatusChanges = 0, @NotifyStatusChanges = 0,
        @SetNotifyTaskSignoffs = 1,  @NotifyTaskSignoffs = 0,
        @SetNotifySlaAndDueDateReminders = 0, @NotifySlaAndDueDateReminders = 0,
        @SetNotifyMentionsAndComments = 0,    @NotifyMentionsAndComments = 1;

    -- Assert — still one row; Signoffs=0 (flipped), Mentions=0 (preserved), others=1 (unchanged).
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.WatcherNotificationPreference);
    DECLARE @Sign BIT = (SELECT NotifyTaskSignoffs FROM dbo.WatcherNotificationPreference);
    DECLARE @Ment BIT = (SELECT NotifyMentionsAndComments FROM dbo.WatcherNotificationPreference);
    DECLARE @Gate BIT = (SELECT NotifyGateDecisions FROM dbo.WatcherNotificationPreference);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Sign;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Ment;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Gate;
END;
GO

CREATE PROCEDURE WatcherPreferencesTests.[test_UpsertPreferenceDeniedForNonMemberWritesNothing]
AS
BEGIN
    -- Act — cc is not a member of the record's workspace.
    EXEC dbo.usp_UpsertWatcherPreference
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000cc',
        @SetNotifyGateDecisions = 1, @NotifyGateDecisions = 0,
        @SetNotifyStatusChanges = 0, @NotifyStatusChanges = 0,
        @SetNotifyTaskSignoffs = 0,  @NotifyTaskSignoffs = 0,
        @SetNotifySlaAndDueDateReminders = 0, @NotifySlaAndDueDateReminders = 0,
        @SetNotifyMentionsAndComments = 0,    @NotifyMentionsAndComments = 0;

    -- Assert — access gate suppressed the write.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.WatcherNotificationPreference);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

-- ── usp_FanOutNotification preference filter ─────────────────────────────────

CREATE PROCEDURE WatcherPreferencesTests.[test_FanoutSuppressesWatcherWhoOptedOutOfCategory]
AS
BEGIN
    -- Arrange — bb watches the record with an explicit opt-out from gate-decided.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Watchers';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Notifications';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    INSERT INTO dbo.Users (UserId, DisplayName, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ana', 0, 0),
           ('00000000-0000-4000-8000-0000000000bb', N'Ben', 0, 0);
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt,
                              IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's');
    INSERT INTO dbo.WatcherNotificationPreference
        (PreferenceId, UserId, RecordId, WorkspaceId,
         NotifyGateDecisions, NotifyStatusChanges, NotifyTaskSignoffs,
         NotifySlaAndDueDateReminders, NotifyMentionsAndComments,
         IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '00000000-0000-4000-8000-0000000000bb', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001',
            0, 1, 1, 1, 1, 0, N's', N's');

    -- Act
    EXEC dbo.usp_FanOutNotification
        @EventId = '11111111-1111-4111-8111-111111111111', @EventType = N'gate.decided',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{}',
        @EventAt = SYSUTCDATETIME();

    -- Assert — no notification landed for bb (preference filter suppressed the target).
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Notifications);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE WatcherPreferencesTests.[test_FanoutMissingPreferenceRowDefaultsToNotify]
AS
BEGIN
    -- Arrange — bb watches; NO preference row exists → all defaults (all 1) apply.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Watchers';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Notifications';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    INSERT INTO dbo.Users (UserId, DisplayName, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ana', 0, 0),
           ('00000000-0000-4000-8000-0000000000bb', N'Ben', 0, 0);
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt,
                              IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's');

    -- Act
    EXEC dbo.usp_FanOutNotification
        @EventId = '22222222-2222-4222-8222-222222222222', @EventType = N'gate.decided',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{}',
        @EventAt = SYSUTCDATETIME();

    -- Assert — bb was notified because the missing preference row defaults to notify.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Notifications WHERE UserId = '00000000-0000-4000-8000-0000000000bb');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE WatcherPreferencesTests.[test_FanoutPreferenceOnlyAppliesToMatchingCategory]
AS
BEGIN
    -- Arrange — bb opts out of Status changes (holdchange/closed), still opted in for
    -- gate decisions. gate.decided must still notify bb.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Watchers';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Notifications';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    INSERT INTO dbo.Users (UserId, DisplayName, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ana', 0, 0),
           ('00000000-0000-4000-8000-0000000000bb', N'Ben', 0, 0);
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt,
                              IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's');
    INSERT INTO dbo.WatcherNotificationPreference
        (PreferenceId, UserId, RecordId, WorkspaceId,
         NotifyGateDecisions, NotifyStatusChanges, NotifyTaskSignoffs,
         NotifySlaAndDueDateReminders, NotifyMentionsAndComments,
         IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '00000000-0000-4000-8000-0000000000bb', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001',
            1, 0, 1, 1, 1, 0, N's', N's');

    -- Act — gate.decided
    EXEC dbo.usp_FanOutNotification
        @EventId = '33333333-3333-4333-8333-333333333333', @EventType = N'gate.decided',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{}',
        @EventAt = SYSUTCDATETIME();

    -- Act — request.hold-changed (should be suppressed by NotifyStatusChanges=0)
    EXEC dbo.usp_FanOutNotification
        @EventId = '44444444-4444-4444-8444-444444444444', @EventType = N'request.hold-changed',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{"held":true}',
        @EventAt = SYSUTCDATETIME();

    -- Assert — bb notified for gate-decided (1) and NOT for hold-changed (0).
    DECLARE @GateCount INT = (SELECT COUNT(*) FROM dbo.Notifications
        WHERE UserId = '00000000-0000-4000-8000-0000000000bb' AND Category = N'gate-decided');
    DECLARE @HoldCount INT = (SELECT COUNT(*) FROM dbo.Notifications
        WHERE UserId = '00000000-0000-4000-8000-0000000000bb' AND Category = N'hold-changed');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @GateCount;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @HoldCount;
END;
GO

-- Slice 26 prototype reconciliation — usp_GetMyWatcherPreferences returns the caller's five effective
-- preferences INDEPENDENT of watch state (drives the always-visible toggles). Membership is gated by
-- the service upstream, so the proc reads unconditionally and always emits exactly one row.
CREATE PROCEDURE WatcherPreferencesTests.[test_GetMyPreferencesDefaultsAllTrueWhenNoRow]
AS
BEGIN
    -- Arrange — no preference row exists for the caller (SetUp fakes the table empty).

    -- Act
    CREATE TABLE #Prefs (
        NotifyGateDecisions BIT, NotifyStatusChanges BIT, NotifyTaskSignoffs BIT,
        NotifySlaAndDueDateReminders BIT, NotifyMentionsAndComments BIT);
    INSERT INTO #Prefs
    EXEC dbo.usp_GetMyWatcherPreferences
        @RecordId = N'AIS-00000001',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — exactly one row; all five default to 1 (opt-out model).
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Prefs);
    DECLARE @Gate  BIT = (SELECT NotifyGateDecisions FROM #Prefs);
    DECLARE @Sla   BIT = (SELECT NotifySlaAndDueDateReminders FROM #Prefs);
    DECLARE @Ment  BIT = (SELECT NotifyMentionsAndComments FROM #Prefs);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Gate;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Sla;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Ment;
END;
GO

CREATE PROCEDURE WatcherPreferencesTests.[test_GetMyPreferencesReflectsStoredDivergenceIndependentOfWatching]
AS
BEGIN
    -- Arrange — a stored preference row with two categories opted out. NO dbo.Watchers row is created,
    -- proving the read surfaces the caller's preferences even when they are not currently watching.
    INSERT INTO dbo.WatcherNotificationPreference
        (PreferenceId, UserId, RecordId, WorkspaceId,
         NotifyGateDecisions, NotifyStatusChanges, NotifyTaskSignoffs,
         NotifySlaAndDueDateReminders, NotifyMentionsAndComments,
         IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '00000000-0000-4000-8000-0000000000aa', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001',
            0, 0, 1, 1, 1, 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Prefs (
        NotifyGateDecisions BIT, NotifyStatusChanges BIT, NotifyTaskSignoffs BIT,
        NotifySlaAndDueDateReminders BIT, NotifyMentionsAndComments BIT);
    INSERT INTO #Prefs
    EXEC dbo.usp_GetMyWatcherPreferences
        @RecordId = N'AIS-00000001',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — the stored divergences surface; the untouched categories stay at 1.
    DECLARE @Gate BIT = (SELECT NotifyGateDecisions FROM #Prefs);
    DECLARE @Stat BIT = (SELECT NotifyStatusChanges FROM #Prefs);
    DECLARE @Sign BIT = (SELECT NotifyTaskSignoffs FROM #Prefs);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Gate;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Stat;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Sign;
END;
GO
