-- =============================================
-- tSQLt tests for the trigger admin CRUD procs (slice: triggers-request-authoring, Task 2.1).
-- Covers:
--   usp_UpsertScheduledTrigger — create inserts the trigger + its conditions; update replaces the
--                                condition set (old soft-deleted, new inserted); cross-workspace update ignored
--   usp_DeleteScheduledTrigger — soft-deletes the trigger + conditions and returns RowsAffected=1;
--                                a cross-workspace delete returns 0 and changes nothing
-- database-testing.md (AAA, FakeTable). Assertions assign the actual into a local variable first.
-- =============================================

EXEC tSQLt.NewTestClass 'TriggersCrudTests';
GO

CREATE PROCEDURE TriggersCrudTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.ScheduledTrigger';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ScheduledTriggerCondition';
END;
GO

CREATE PROCEDURE TriggersCrudTests.[test upsert create inserts the trigger and its conditions]
AS
BEGIN
    -- Arrange
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @conds NVARCHAR(MAX) = N'[{"whenFieldKey":"dueDate","comparator":"lt","compareValue":"@today"}]';

    -- Act
    DECLARE @out TABLE (TriggerId UNIQUEIDENTIFIER);
    INSERT INTO @out EXEC dbo.usp_UpsertScheduledTrigger
        @TriggerId = NULL, @WorkspaceId = @ws, @ObjectType = N'Request', @Kind = N'Authored', @Name = N'SLA',
        @IsEnabled = 0, @Cadence = N'RepeatEveryNDays', @RepeatIntervalDays = 1, @WindowDays = NULL,
        @NotificationCategory = N'sla-reminder', @Recipients = N'["assignedAnalyst"]',
        @NotificationTitle = N'Overdue', @NotificationBody = N'b', @ConditionsJson = @conds, @By = N'a';

    -- Assert
    DECLARE @tid UNIQUEIDENTIFIER = (SELECT TriggerId FROM @out);
    DECLARE @triggerRows INT = (SELECT COUNT(*) FROM dbo.ScheduledTrigger WHERE TriggerId = @tid AND IsDeleted = 0);
    DECLARE @condRows INT = (SELECT COUNT(*) FROM dbo.ScheduledTriggerCondition WHERE TriggerId = @tid AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @triggerRows;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @condRows;
END;
GO

CREATE PROCEDURE TriggersCrudTests.[test upsert update replaces the condition set]
AS
BEGIN
    -- Arrange — a trigger with one condition already present.
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @tid UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000a1';
    INSERT INTO dbo.ScheduledTrigger (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence,
        NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@tid, @ws, N'Request', N'Authored', N'Old', 0, N'Once', N'sla-reminder', N'[]', N'x', N'y', N'a', N'a', 0);
    INSERT INTO dbo.ScheduledTriggerCondition (ConditionId, TriggerId, WhenFieldKey, Comparator, CompareValue, SortOrder, CreatedBy, UpdatedBy, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000b1', @tid, N'dueDate', N'lt', N'@today', 0, N'a', N'a', 0);

    -- Act — update with a two-condition set.
    DECLARE @conds NVARCHAR(MAX) = N'[{"whenFieldKey":"dueDate","comparator":"lt","compareValue":"@today"},{"whenFieldKey":"stage","comparator":"neq","compareValue":"Closeout"}]';
    DECLARE @out TABLE (TriggerId UNIQUEIDENTIFIER);
    INSERT INTO @out EXEC dbo.usp_UpsertScheduledTrigger
        @TriggerId = @tid, @WorkspaceId = @ws, @ObjectType = N'Request', @Kind = N'Authored', @Name = N'New',
        @IsEnabled = 1, @Cadence = N'Once', @RepeatIntervalDays = NULL, @WindowDays = NULL,
        @NotificationCategory = N'sla-reminder', @Recipients = N'["assignedAnalyst"]',
        @NotificationTitle = N'Overdue', @NotificationBody = N'b', @ConditionsJson = @conds, @By = N'a';

    -- Assert — exactly two live conditions (the old one soft-deleted), and the name updated.
    DECLARE @liveConds INT = (SELECT COUNT(*) FROM dbo.ScheduledTriggerCondition WHERE TriggerId = @tid AND IsDeleted = 0);
    DECLARE @name NVARCHAR(200) = (SELECT Name FROM dbo.ScheduledTrigger WHERE TriggerId = @tid);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @liveConds;
    EXEC tSQLt.AssertEqualsString @Expected = N'New', @Actual = @name;
END;
GO

CREATE PROCEDURE TriggersCrudTests.[test delete soft-deletes in-workspace and ignores cross-workspace]
AS
BEGIN
    -- Arrange
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @otherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000002';
    DECLARE @tid UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000c1';
    INSERT INTO dbo.ScheduledTrigger (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence,
        NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@tid, @ws, N'Request', N'Authored', N'T', 0, N'Once', N'sla-reminder', N'[]', N'x', N'y', N'a', N'a', 0);

    -- Act 1 — a delete from a different workspace must not touch the row.
    DECLARE @wrong TABLE (RowsAffected INT);
    INSERT INTO @wrong EXEC dbo.usp_DeleteScheduledTrigger @TriggerId = @tid, @WorkspaceId = @otherWs, @By = N'a';
    DECLARE @wrongAffected INT = (SELECT RowsAffected FROM @wrong);
    DECLARE @stillLive INT = (SELECT COUNT(*) FROM dbo.ScheduledTrigger WHERE TriggerId = @tid AND IsDeleted = 0);

    -- Act 2 — the correct-workspace delete soft-deletes it.
    DECLARE @right TABLE (RowsAffected INT);
    INSERT INTO @right EXEC dbo.usp_DeleteScheduledTrigger @TriggerId = @tid, @WorkspaceId = @ws, @By = N'a';
    DECLARE @rightAffected INT = (SELECT RowsAffected FROM @right);
    DECLARE @liveAfter INT = (SELECT COUNT(*) FROM dbo.ScheduledTrigger WHERE TriggerId = @tid AND IsDeleted = 0);

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @wrongAffected;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @stillLive;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @rightAffected;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @liveAfter;
END;
GO
