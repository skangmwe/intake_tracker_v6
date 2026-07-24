-- =============================================
-- tSQLt tests for the trigger.fired branch of usp_FanOutNotification (slice: triggers-engine-core, Task 1.3).
-- Covers:
--   trigger.fired inserts one bell row per payload recipient and excludes the actor
--   the SLA/due categories (sla-reminder) honor NotifySlaAndDueDateReminders = 0 (target suppressed)
--   benefit-review is NOT filtered by that reminder preference (it is a value-loop prompt, not a due reminder)
-- database-testing.md (AAA, FakeTable). The Category CHECK is stripped by FakeTable, so the proc's own
-- insert of the new categories is what is exercised here.
-- =============================================

EXEC tSQLt.NewTestClass 'TriggerFanoutTests';
GO

CREATE PROCEDURE TriggerFanoutTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Notifications';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WatcherNotificationPreference';

    -- Recipients + actor exist and are enabled (so the disabled-suppression join keeps them).
    INSERT INTO dbo.Users (UserId, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-000000000001', 0, 0),
           ('00000000-0000-4000-8000-000000000002', 0, 0),
           ('00000000-0000-4000-8000-0000000000ac', 0, 0);
END;
GO

CREATE PROCEDURE TriggerFanoutTests.[test trigger.fired inserts one row per recipient and excludes the actor]
AS
BEGIN
    -- Arrange
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @actor UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000ac';
    DECLARE @eid UNIQUEIDENTIFIER = '22220000-0000-4000-8000-000000000001';
    -- Payload names u1, u2 AND the actor; the actor must be excluded.
    DECLARE @payload NVARCHAR(MAX) = N'{"kind":"sla-reminder","recipientUserIds":['
        + N'"00000000-0000-4000-8000-000000000001",'
        + N'"00000000-0000-4000-8000-000000000002",'
        + N'"00000000-0000-4000-8000-0000000000ac"],"includeWatchers":false,"title":"Overdue"}';

    -- Act
    EXEC dbo.usp_FanOutNotification @EventId = @eid, @EventType = N'trigger.fired', @WorkspaceId = @ws,
        @RecordId = N'LIT-1', @ActorUserId = @actor, @PayloadJson = @payload, @EventAt = NULL;

    -- Assert — two rows (u1, u2), the actor excluded, all under the sla-reminder category.
    DECLARE @rows INT = (SELECT COUNT(*) FROM dbo.Notifications WHERE SourceEventId = @eid);
    DECLARE @actorRows INT = (SELECT COUNT(*) FROM dbo.Notifications WHERE SourceEventId = @eid AND UserId = @actor);
    DECLARE @category NVARCHAR(32) = (SELECT TOP 1 Category FROM dbo.Notifications WHERE SourceEventId = @eid);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @rows;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @actorRows;
    EXEC tSQLt.AssertEqualsString @Expected = N'sla-reminder', @Actual = @category;
END;
GO

CREATE PROCEDURE TriggerFanoutTests.[test sla-reminder honors NotifySlaAndDueDateReminders off]
AS
BEGIN
    -- Arrange — u1 has the reminder preference switched off for this record.
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @eid UNIQUEIDENTIFIER = '22220000-0000-4000-8000-000000000002';
    INSERT INTO dbo.WatcherNotificationPreference (UserId, RecordId, WorkspaceId, NotifySlaAndDueDateReminders, IsDeleted)
    VALUES ('00000000-0000-4000-8000-000000000001', N'LIT-1', @ws, 0, 0);
    DECLARE @payload NVARCHAR(MAX) = N'{"kind":"sla-reminder","recipientUserIds":['
        + N'"00000000-0000-4000-8000-000000000001"],"includeWatchers":false,"title":"Overdue"}';

    -- Act
    EXEC dbo.usp_FanOutNotification @EventId = @eid, @EventType = N'trigger.fired', @WorkspaceId = @ws,
        @RecordId = N'LIT-1', @ActorUserId = NULL, @PayloadJson = @payload, @EventAt = NULL;

    -- Assert — the target is suppressed by the preference.
    DECLARE @rows INT = (SELECT COUNT(*) FROM dbo.Notifications WHERE SourceEventId = @eid);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @rows;
END;
GO

CREATE PROCEDURE TriggerFanoutTests.[test benefit-review is not filtered by the reminder preference]
AS
BEGIN
    -- Arrange — same preference off, but benefit-review is not a due/SLA reminder so it is not filtered.
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @eid UNIQUEIDENTIFIER = '22220000-0000-4000-8000-000000000003';
    INSERT INTO dbo.WatcherNotificationPreference (UserId, RecordId, WorkspaceId, NotifySlaAndDueDateReminders, IsDeleted)
    VALUES ('00000000-0000-4000-8000-000000000001', N'LIT-1', @ws, 0, 0);
    DECLARE @payload NVARCHAR(MAX) = N'{"kind":"benefit-review","recipientUserIds":['
        + N'"00000000-0000-4000-8000-000000000001"],"includeWatchers":false,"title":"Benefit review"}';

    -- Act
    EXEC dbo.usp_FanOutNotification @EventId = @eid, @EventType = N'trigger.fired', @WorkspaceId = @ws,
        @RecordId = N'LIT-1', @ActorUserId = NULL, @PayloadJson = @payload, @EventAt = NULL;

    -- Assert — the target still receives the benefit-review prompt.
    DECLARE @rows INT = (SELECT COUNT(*) FROM dbo.Notifications WHERE SourceEventId = @eid);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @rows;
END;
GO
