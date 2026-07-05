-- =============================================
-- tSQLt tests for usp_FanOutNotification (Slice 12) — the notification materialiser.
-- Covers per-event-type target resolution + the cross-cutting rules:
--   gate.decided / hold-changed / closed → the record's watchers (all sides)
--   comment.posted                       → payload.mentionedUserIds only (watchers NOT consulted)
--   gate.opened                          → the frozen eligible approvers
--   escalation.opened                    → the AI-Intake group on payload.aiWorkspaceId
--   non-notifiable event                 → no rows
-- Cross-cutting: the actor is excluded; disabled accounts are suppressed (BS §6.8); a user watching
-- both sides of an escalated record is deduped to one row; a re-delivered event inserts nothing new.
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'NotificationFanoutTests';
GO

CREATE PROCEDURE NotificationFanoutTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Watchers';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Notifications';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.UserGroup';
    EXEC tSQLt.FakeTable @TableName = 'dbo.UserGroupMembership';

    -- aa = actor, bb = a normal recipient, dd = disabled recipient.
    INSERT INTO dbo.Users (UserId, DisplayName, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ana',   0, 0),
           ('00000000-0000-4000-8000-0000000000bb', N'Ben',   0, 0),
           ('00000000-0000-4000-8000-0000000000dd', N'Dana',  1, 0);
END;
GO

CREATE PROCEDURE NotificationFanoutTests.[test_GateDecidedNotifiesWatchersExcludingActorAndDisabled]
AS
BEGIN
    -- Arrange — bb (enabled) and dd (disabled) and aa (the actor) all watch AIS-1 on WS1.
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's'),
           (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000dd', SYSUTCDATETIME(), 0, N's', N's'),
           (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', SYSUTCDATETIME(), 0, N's', N's');

    -- Act
    EXEC dbo.usp_FanOutNotification
        @EventId = '11111111-1111-4111-8111-111111111111', @EventType = N'gate.decided',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{}', @EventAt = SYSUTCDATETIME();

    -- Assert — only bb notified (aa is the actor; dd is disabled).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications);
    DECLARE @U UNIQUEIDENTIFIER = (SELECT TOP 1 UserId FROM dbo.Notifications);
    EXEC tSQLt.AssertEquals @Expected = '00000000-0000-4000-8000-0000000000bb', @Actual = @U;
    DECLARE @Cat NVARCHAR(32) = (SELECT TOP 1 Category FROM dbo.Notifications);
    EXEC tSQLt.AssertEquals @Expected = N'gate-decided', @Actual = @Cat;
END;
GO

CREATE PROCEDURE NotificationFanoutTests.[test_CrossSideWatcherDedupedToOneRow]
AS
BEGIN
    -- Arrange — bb watches BOTH sides of an escalated record (same RecordId, two workspaces).
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's'),
           (NEWID(), N'AIS-00000001', '1B150000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's');

    -- Act
    EXEC dbo.usp_FanOutNotification
        @EventId = '22222222-2222-4222-8222-222222222222', @EventType = N'request.closed',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{}', @EventAt = SYSUTCDATETIME();

    -- Assert — exactly one row for bb (dedup key user+record+category+event).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications WHERE UserId = '00000000-0000-4000-8000-0000000000bb');
END;
GO

CREATE PROCEDURE NotificationFanoutTests.[test_CommentPostedNotifiesMentionedOnly]
AS
BEGIN
    -- Arrange — bb watches, but the comment mentions nobody who is watching; cc is mentioned.
    INSERT INTO dbo.Users (UserId, DisplayName, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000cc', N'Cora', 0, 0);
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's');

    -- Act — comment mentions cc only.
    EXEC dbo.usp_FanOutNotification
        @EventId = '33333333-3333-4333-8333-333333333333', @EventType = N'comment.posted',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa',
        @PayloadJson = N'{"commentId":"x","mentionedUserIds":["00000000-0000-4000-8000-0000000000cc"]}',
        @EventAt = SYSUTCDATETIME();

    -- Assert — only cc (mentioned); bb (a mere watcher) is NOT notified for a plain comment.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications);
    DECLARE @U UNIQUEIDENTIFIER = (SELECT TOP 1 UserId FROM dbo.Notifications);
    EXEC tSQLt.AssertEquals @Expected = '00000000-0000-4000-8000-0000000000cc', @Actual = @U;
    EXEC tSQLt.AssertEquals @Expected = N'mentioned', @Actual = (SELECT TOP 1 Category FROM dbo.Notifications);
END;
GO

CREATE PROCEDURE NotificationFanoutTests.[test_GateOpenedNotifiesFrozenApprovers]
AS
BEGIN
    -- Arrange — an ApprovalRequest whose frozen set makes bb eligible.
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, State, FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('AAAAAAAA-0000-4000-8000-000000000001', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Pending',
            N'[{"slotIndex":0,"roleLabel":"Manager","displayLabel":"Manager","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000bb","displayName":"Ben"}]}]',
            0, N's', N's');

    -- Act
    EXEC dbo.usp_FanOutNotification
        @EventId = '44444444-4444-4444-8444-444444444444', @EventType = N'gate.opened',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa',
        @PayloadJson = N'{"approvalRequestId":"AAAAAAAA-0000-4000-8000-000000000001"}', @EventAt = SYSUTCDATETIME();

    -- Assert — bb notified with the sign-off-requested category.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications WHERE UserId = '00000000-0000-4000-8000-0000000000bb');
    EXEC tSQLt.AssertEquals @Expected = N'sign-off-requested', @Actual = (SELECT TOP 1 Category FROM dbo.Notifications);
END;
GO

CREATE PROCEDURE NotificationFanoutTests.[test_EscalationOpenedNotifiesAiIntakeGroup]
AS
BEGIN
    -- Arrange — the AI-Intake group on the AI workspace with bb as a member.
    INSERT INTO dbo.UserGroup (UserGroupId, WorkspaceId, Name, GroupKey, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('11111111-0000-4000-8000-0000000000a1', '1A150000-0000-4000-8000-000000000001', N'AI Intake', N'ai-intake', 0, N's', N's');
    INSERT INTO dbo.UserGroupMembership (UserGroupMembershipId, UserGroupId, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '11111111-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000bb', 0, N's', N's');

    -- Act — escalation fired on the PG side; payload names the AI-side workspace.
    EXEC dbo.usp_FanOutNotification
        @EventId = '55555555-5555-4555-8555-555555555555', @EventType = N'escalation.opened',
        @WorkspaceId = '1B150000-0000-4000-8000-000000000002', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa',
        @PayloadJson = N'{"originWorkspaceId":"1B150000-0000-4000-8000-000000000002","aiWorkspaceId":"1A150000-0000-4000-8000-000000000001"}',
        @EventAt = SYSUTCDATETIME();

    -- Assert — bb (AI-Intake member) notified with escalation-received.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications WHERE UserId = '00000000-0000-4000-8000-0000000000bb');
    EXEC tSQLt.AssertEquals @Expected = N'escalation-received', @Actual = (SELECT TOP 1 Category FROM dbo.Notifications);
END;
GO

CREATE PROCEDURE NotificationFanoutTests.[test_NonNotifiableEventInsertsNothing]
AS
BEGIN
    -- Arrange — bb watches, but the event type is not notifiable.
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's');

    -- Act
    EXEC dbo.usp_FanOutNotification
        @EventId = '66666666-6666-4666-8666-666666666666', @EventType = N'request.updated',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{}', @EventAt = SYSUTCDATETIME();

    -- Assert — no rows (request.updated is not a notifiable event).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM dbo.Notifications);
END;
GO

CREATE PROCEDURE NotificationFanoutTests.[test_RedeliveredEventIsIdempotent]
AS
BEGIN
    -- Arrange — bb watches.
    INSERT INTO dbo.Watchers (WatcherId, RecordId, WorkspaceId, UserId, SubscribedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', SYSUTCDATETIME(), 0, N's', N's');

    -- Act — the same event delivered twice.
    EXEC dbo.usp_FanOutNotification
        @EventId = '77777777-7777-4777-8777-777777777777', @EventType = N'gate.decided',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{}', @EventAt = SYSUTCDATETIME();
    EXEC dbo.usp_FanOutNotification
        @EventId = '77777777-7777-4777-8777-777777777777', @EventType = N'gate.decided',
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @RecordId = N'AIS-00000001',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @PayloadJson = N'{}', @EventAt = SYSUTCDATETIME();

    -- Assert — still exactly one row (dedup on the source event).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Notifications);
END;
GO
