-- =============================================
-- tSQLt tests for the time-based-trigger procs (slice: triggers-engine-core, Task 1.3).
-- Covers:
--   usp_TryBeginTriggerSweep       — first caller claims the day (1), a second call the same day (0)
--   usp_GetTriggerCandidates       — returns OPEN requests in the trigger's workspace; excludes closed
--                                    (outcome set), soft-deleted, and other workspaces
--   usp_GetEnabledAuthoredTriggers — enabled 'Authored' triggers with conditions rolled up; excludes
--                                    disabled, soft-deleted, and built-in (non-Authored) kinds
--   usp_UpsertTriggerFire          — inserts on first fire, updates LastFiredDate on re-fire (idempotent)
-- database-testing.md (AAA, FakeTable). Assertions assign the actual into a local variable first, and
-- match the expected value's base type (tSQLt.AssertEquals is sql_variant type-strict — BIT != INT).
-- =============================================

EXEC tSQLt.NewTestClass 'TriggersTests';
GO

CREATE PROCEDURE TriggersTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.ScheduledTrigger';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ScheduledTriggerCondition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ScheduledTriggerFire';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ScheduledTriggerSweepLog';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
END;
GO

CREATE PROCEDURE TriggersTests.[test usp_TryBeginTriggerSweep first claims the day, second does not]
AS
BEGIN
    -- Arrange
    DECLARE @today DATE = '2026-07-24';
    DECLARE @expClaimed BIT = 1;
    DECLARE @expBlocked BIT = 0;
    DECLARE @first TABLE (Claimed BIT);
    DECLARE @second TABLE (Claimed BIT);

    -- Act
    INSERT INTO @first  EXEC dbo.usp_TryBeginTriggerSweep @Today = @today, @By = N'system';
    INSERT INTO @second EXEC dbo.usp_TryBeginTriggerSweep @Today = @today, @By = N'system';

    -- Assert
    DECLARE @firstClaimed BIT = (SELECT Claimed FROM @first);
    DECLARE @secondClaimed BIT = (SELECT Claimed FROM @second);
    EXEC tSQLt.AssertEquals @Expected = @expClaimed, @Actual = @firstClaimed;
    EXEC tSQLt.AssertEquals @Expected = @expBlocked, @Actual = @secondClaimed;
END;
GO

CREATE PROCEDURE TriggersTests.[test usp_GetTriggerCandidates returns only open non-deleted requests in the workspace]
AS
BEGIN
    -- Arrange
    DECLARE @tid UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000a1';
    DECLARE @ws  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @otherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000002';
    INSERT INTO dbo.ScheduledTrigger (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence,
        NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@tid, @ws, N'Request', N'Authored', N'T', 1, N'Once', N'sla-reminder', N'[]', N'x', N'y', N'a', N'a', 0);

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, FieldValues, IsDeleted)
    VALUES (N'LIT-1', @ws,      N'{"dueDate":"2026-01-01"}', 0),                    -- open, in ws -> included
           (N'LIT-2', @ws,      N'{"outcome":"Delivered"}', 0),                    -- closed -> excluded
           (N'LIT-3', @ws,      N'{"dueDate":"2026-01-02"}', 1),                    -- soft-deleted -> excluded
           (N'LIT-4', @otherWs, N'{"dueDate":"2026-01-03"}', 0);                    -- other ws -> excluded

    -- Act
    DECLARE @out TABLE (RecordId NVARCHAR(64), WatermarkKey NVARCHAR(64), FieldValuesJson NVARCHAR(MAX), AssigneeUserId UNIQUEIDENTIFIER, ApproverSetJson NVARCHAR(MAX));
    INSERT INTO @out EXEC dbo.usp_GetTriggerCandidates @TriggerId = @tid, @Today = '2026-07-24';

    -- Assert — the one open request; for an Authored trigger the watermark keys on the record id and there
    -- is no assignee (recipients come from the record's fields).
    DECLARE @count INT = (SELECT COUNT(*) FROM @out);
    DECLARE @onlyRecord NVARCHAR(64) = (SELECT TOP 1 RecordId FROM @out);
    DECLARE @onlyWatermark NVARCHAR(64) = (SELECT TOP 1 WatermarkKey FROM @out);
    DECLARE @assigneeNullCount INT = (SELECT COUNT(*) FROM @out WHERE AssigneeUserId IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @count;
    EXEC tSQLt.AssertEqualsString @Expected = N'LIT-1', @Actual = @onlyRecord;
    EXEC tSQLt.AssertEqualsString @Expected = N'LIT-1', @Actual = @onlyWatermark;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @assigneeNullCount;
END;
GO

CREATE PROCEDURE TriggersTests.[test usp_GetTriggerCandidates returns only open overdue non-deleted tasks in the workspace]
AS
BEGIN
    -- Arrange
    DECLARE @tid UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000b1';
    DECLARE @ws  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @otherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000002';
    DECLARE @assignee UNIQUEIDENTIFIER = '22222222-2222-2222-2222-222222222222';
    DECLARE @overdueTask UNIQUEIDENTIFIER = '33333333-3333-4000-8000-000000000001';
    INSERT INTO dbo.ScheduledTrigger (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence,
        NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@tid, @ws, N'Task', N'TaskOverdue', N'T', 1, N'RepeatEveryNDays', N'task-overdue', N'[]', N'x', N'y', N'a', N'a', 0);

    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Status, DueDate, AssigneeUserId, IsDeleted)
    VALUES (@overdueTask, N'LIT-1', @ws,      N'Open', '2026-07-20', @assignee, 0),  -- open + overdue + in ws -> included
           (NEWID(),      N'LIT-1', @ws,      N'Open', '2026-12-31', @assignee, 0),  -- open but not yet due -> excluded
           (NEWID(),      N'LIT-2', @ws,      N'Done', '2026-07-20', @assignee, 0),  -- overdue but done -> excluded
           (NEWID(),      N'LIT-3', @ws,      N'Open', NULL,         @assignee, 0),  -- no due date -> excluded
           (NEWID(),      N'LIT-4', @ws,      N'Open', '2026-07-20', @assignee, 1),  -- soft-deleted -> excluded
           (NEWID(),      N'LIT-5', @otherWs, N'Open', '2026-07-20', @assignee, 0);  -- other ws -> excluded

    -- Act
    DECLARE @today DATE = '2026-07-24';
    DECLARE @out TABLE (RecordId NVARCHAR(64), WatermarkKey NVARCHAR(64), FieldValuesJson NVARCHAR(MAX), AssigneeUserId UNIQUEIDENTIFIER, ApproverSetJson NVARCHAR(MAX));
    INSERT INTO @out EXEC dbo.usp_GetTriggerCandidates @TriggerId = @tid, @Today = @today;

    -- Assert — only the open, overdue, non-deleted task in the workspace; watermark keyed on its TaskId,
    -- fan-out record is the parent request, assignee carried through.
    DECLARE @expWatermark NVARCHAR(64) = CAST(@overdueTask AS NVARCHAR(64));
    DECLARE @count INT = (SELECT COUNT(*) FROM @out);
    DECLARE @recordId NVARCHAR(64) = (SELECT TOP 1 RecordId FROM @out);
    DECLARE @watermark NVARCHAR(64) = (SELECT TOP 1 WatermarkKey FROM @out);
    DECLARE @assigneeOut UNIQUEIDENTIFIER = (SELECT TOP 1 AssigneeUserId FROM @out);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @count;
    EXEC tSQLt.AssertEqualsString @Expected = N'LIT-1', @Actual = @recordId;
    EXEC tSQLt.AssertEqualsString @Expected = @expWatermark, @Actual = @watermark;
    EXEC tSQLt.AssertEquals @Expected = @assignee, @Actual = @assigneeOut;
END;
GO

CREATE PROCEDURE TriggersTests.[test usp_GetEnabledTaskOverdueTriggers excludes disabled deleted and authored]
AS
BEGIN
    -- Arrange
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.ScheduledTrigger (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence,
        NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy, IsDeleted)
    VALUES ('00000000-0000-4000-8000-00000000010a', @ws, N'Task',    N'TaskOverdue', N'keep',     1, N'Once', N'task-overdue', N'[]', N'x', N'y', N'a', N'a', 0),
           ('00000000-0000-4000-8000-00000000010b', @ws, N'Task',    N'TaskOverdue', N'disabled', 0, N'Once', N'task-overdue', N'[]', N'x', N'y', N'a', N'a', 0),
           ('00000000-0000-4000-8000-00000000010c', @ws, N'Task',    N'TaskOverdue', N'deleted',  1, N'Once', N'task-overdue', N'[]', N'x', N'y', N'a', N'a', 1),
           ('00000000-0000-4000-8000-00000000010d', @ws, N'Request', N'Authored',    N'authored', 1, N'Once', N'sla-reminder', N'[]', N'x', N'y', N'a', N'a', 0);

    -- Act
    DECLARE @out TABLE (TriggerId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(64),
        Kind NVARCHAR(32), Name NVARCHAR(200), Cadence NVARCHAR(32), RepeatIntervalDays INT,
        NotificationCategory NVARCHAR(32), Recipients NVARCHAR(MAX), NotificationTitle NVARCHAR(200),
        NotificationBody NVARCHAR(MAX), ConditionsJson NVARCHAR(MAX));
    INSERT INTO @out EXEC dbo.usp_GetEnabledTaskOverdueTriggers;

    -- Assert — only the enabled, non-deleted TaskOverdue trigger; no authored conditions (empty array).
    DECLARE @count INT = (SELECT COUNT(*) FROM @out);
    DECLARE @name NVARCHAR(200) = (SELECT TOP 1 Name FROM @out);
    DECLARE @conditions NVARCHAR(MAX) = (SELECT TOP 1 ConditionsJson FROM @out);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @count;
    EXEC tSQLt.AssertEqualsString @Expected = N'keep', @Actual = @name;
    EXEC tSQLt.AssertEqualsString @Expected = N'[]', @Actual = @conditions;
END;
GO

CREATE PROCEDURE TriggersTests.[test usp_GetTriggerCandidates returns only unresolved overdue non-deleted approvals in the workspace]
AS
BEGIN
    -- Arrange
    DECLARE @tid UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000c1';
    DECLARE @ws  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @otherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000002';
    DECLARE @pendingGate UNIQUEIDENTIFIER = '44444444-4444-4000-8000-000000000001';
    DECLARE @changesGate UNIQUEIDENTIFIER = '44444444-4444-4000-8000-000000000002';
    DECLARE @frozen NVARCHAR(MAX) = N'[{"slotIndex":0,"eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000cc","displayName":"A"}]}]';
    INSERT INTO dbo.ScheduledTrigger (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence,
        NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@tid, @ws, N'Approval', N'ApprovalOverdue', N'T', 1, N'RepeatEveryNDays', N'approval-overdue', N'[]', N'x', N'y', N'a', N'a', 0);

    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId, GateName,
        FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State, OpenedAt, RespondByDate, FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (@pendingGate, N'LIT-1', @ws,      NEWID(), N'g', N'a', N'b', N'A', N'B', N'Pending',          SYSUTCDATETIME(), '2026-07-20', @frozen, 0, N's', N's'),  -- unresolved + overdue + in ws -> included
        (@changesGate, N'LIT-1', @ws,      NEWID(), N'g', N'a', N'b', N'A', N'B', N'ChangesRequested', SYSUTCDATETIME(), '2026-07-20', @frozen, 0, N's', N's'),  -- unresolved (changes) + overdue -> included
        (NEWID(),      N'LIT-2', @ws,      NEWID(), N'g', N'a', N'b', N'A', N'B', N'Resolved',         SYSUTCDATETIME(), '2026-07-20', @frozen, 0, N's', N's'),  -- resolved -> excluded
        (NEWID(),      N'LIT-3', @ws,      NEWID(), N'g', N'a', N'b', N'A', N'B', N'Pending',          SYSUTCDATETIME(), '2026-12-31', @frozen, 0, N's', N's'),  -- respond-by in future -> excluded
        (NEWID(),      N'LIT-4', @ws,      NEWID(), N'g', N'a', N'b', N'A', N'B', N'Pending',          SYSUTCDATETIME(), NULL,         @frozen, 0, N's', N's'),  -- no respond-by -> excluded
        (NEWID(),      N'LIT-5', @ws,      NEWID(), N'g', N'a', N'b', N'A', N'B', N'Pending',          SYSUTCDATETIME(), '2026-07-20', @frozen, 1, N's', N's'),  -- soft-deleted -> excluded
        (NEWID(),      N'LIT-6', @otherWs, NEWID(), N'g', N'a', N'b', N'A', N'B', N'Pending',          SYSUTCDATETIME(), '2026-07-20', @frozen, 0, N's', N's');  -- other ws -> excluded

    -- Act
    DECLARE @today DATE = '2026-07-24';
    DECLARE @out TABLE (RecordId NVARCHAR(64), WatermarkKey NVARCHAR(64), FieldValuesJson NVARCHAR(MAX), AssigneeUserId UNIQUEIDENTIFIER, ApproverSetJson NVARCHAR(MAX));
    INSERT INTO @out EXEC dbo.usp_GetTriggerCandidates @TriggerId = @tid, @Today = @today;

    -- Assert — both unresolved overdue gates (Pending + ChangesRequested); watermark keyed on ApprovalRequestId,
    -- fan-out record is the parent request, frozen approver set carried through.
    DECLARE @count INT = (SELECT COUNT(*) FROM @out);
    DECLARE @hasPending INT = (SELECT COUNT(*) FROM @out WHERE WatermarkKey = CAST(@pendingGate AS NVARCHAR(64)));
    DECLARE @hasChanges INT = (SELECT COUNT(*) FROM @out WHERE WatermarkKey = CAST(@changesGate AS NVARCHAR(64)));
    DECLARE @approversPresent INT = (SELECT COUNT(*) FROM @out WHERE ApproverSetJson LIKE N'%eligibleMembers%');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @count;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @hasPending;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @hasChanges;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @approversPresent;
END;
GO

CREATE PROCEDURE TriggersTests.[test usp_GetEnabledApprovalOverdueTriggers excludes disabled deleted and other kinds]
AS
BEGIN
    -- Arrange
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.ScheduledTrigger (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence,
        NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy, IsDeleted)
    VALUES ('00000000-0000-4000-8000-00000000020a', @ws, N'Approval', N'ApprovalOverdue', N'keep',     1, N'Once', N'approval-overdue', N'[]', N'x', N'y', N'a', N'a', 0),
           ('00000000-0000-4000-8000-00000000020b', @ws, N'Approval', N'ApprovalOverdue', N'disabled', 0, N'Once', N'approval-overdue', N'[]', N'x', N'y', N'a', N'a', 0),
           ('00000000-0000-4000-8000-00000000020c', @ws, N'Approval', N'ApprovalOverdue', N'deleted',  1, N'Once', N'approval-overdue', N'[]', N'x', N'y', N'a', N'a', 1),
           ('00000000-0000-4000-8000-00000000020d', @ws, N'Task',     N'TaskOverdue',     N'task',     1, N'Once', N'task-overdue',     N'[]', N'x', N'y', N'a', N'a', 0),
           ('00000000-0000-4000-8000-00000000020e', @ws, N'Request',  N'Authored',        N'authored', 1, N'Once', N'sla-reminder',     N'[]', N'x', N'y', N'a', N'a', 0);

    -- Act
    DECLARE @out TABLE (TriggerId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(64),
        Kind NVARCHAR(32), Name NVARCHAR(200), Cadence NVARCHAR(32), RepeatIntervalDays INT,
        NotificationCategory NVARCHAR(32), Recipients NVARCHAR(MAX), NotificationTitle NVARCHAR(200),
        NotificationBody NVARCHAR(MAX), ConditionsJson NVARCHAR(MAX));
    INSERT INTO @out EXEC dbo.usp_GetEnabledApprovalOverdueTriggers;

    -- Assert — only the enabled, non-deleted ApprovalOverdue trigger; no authored conditions (empty array).
    DECLARE @count INT = (SELECT COUNT(*) FROM @out);
    DECLARE @name NVARCHAR(200) = (SELECT TOP 1 Name FROM @out);
    DECLARE @conditions NVARCHAR(MAX) = (SELECT TOP 1 ConditionsJson FROM @out);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @count;
    EXEC tSQLt.AssertEqualsString @Expected = N'keep', @Actual = @name;
    EXEC tSQLt.AssertEqualsString @Expected = N'[]', @Actual = @conditions;
END;
GO

CREATE PROCEDURE TriggersTests.[test usp_GetEnabledAuthoredTriggers excludes disabled deleted and built-in]
AS
BEGIN
    -- Arrange
    DECLARE @ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    INSERT INTO dbo.ScheduledTrigger (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence,
        NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy, IsDeleted)
    VALUES ('00000000-0000-4000-8000-00000000000a', @ws, N'Request', N'Authored',    N'keep',     1, N'Once', N'sla-reminder', N'[]', N'x', N'y', N'a', N'a', 0),
           ('00000000-0000-4000-8000-00000000000b', @ws, N'Request', N'Authored',    N'disabled', 0, N'Once', N'sla-reminder', N'[]', N'x', N'y', N'a', N'a', 0),
           ('00000000-0000-4000-8000-00000000000c', @ws, N'Request', N'Authored',    N'deleted',  1, N'Once', N'sla-reminder', N'[]', N'x', N'y', N'a', N'a', 1),
           ('00000000-0000-4000-8000-00000000000d', @ws, N'Task',    N'TaskOverdue', N'builtin',  1, N'Once', N'task-overdue', N'[]', N'x', N'y', N'a', N'a', 0);
    INSERT INTO dbo.ScheduledTriggerCondition (ConditionId, TriggerId, WhenFieldKey, Comparator, CompareValue, SortOrder, CreatedBy, UpdatedBy, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', N'dueDate', N'lt', N'@today', 0, N'a', N'a', 0);

    -- Act
    DECLARE @out TABLE (TriggerId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(64),
        Kind NVARCHAR(32), Name NVARCHAR(200), Cadence NVARCHAR(32), RepeatIntervalDays INT,
        NotificationCategory NVARCHAR(32), Recipients NVARCHAR(MAX), NotificationTitle NVARCHAR(200),
        NotificationBody NVARCHAR(MAX), ConditionsJson NVARCHAR(MAX));
    INSERT INTO @out EXEC dbo.usp_GetEnabledAuthoredTriggers;

    -- Assert — only the enabled, non-deleted Authored trigger is returned, with its condition rolled up.
    DECLARE @count INT = (SELECT COUNT(*) FROM @out);
    DECLARE @name NVARCHAR(200) = (SELECT TOP 1 Name FROM @out);
    DECLARE @hasCondition INT =
        (SELECT CASE WHEN ConditionsJson LIKE N'%dueDate%' THEN 1 ELSE 0 END FROM @out);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @count;
    EXEC tSQLt.AssertEqualsString @Expected = N'keep', @Actual = @name;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @hasCondition;
END;
GO

CREATE PROCEDURE TriggersTests.[test usp_UpsertTriggerFire inserts then updates the watermark]
AS
BEGIN
    -- Arrange
    DECLARE @tid UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000f1';
    DECLARE @expDate DATE = '2026-07-24';

    -- Act — first fire inserts, second fire updates the date.
    EXEC dbo.usp_UpsertTriggerFire @TriggerId = @tid, @RecordId = N'LIT-1', @FiredDate = '2026-07-20', @By = N'system';
    DECLARE @afterInsert INT = (SELECT COUNT(*) FROM dbo.ScheduledTriggerFire WHERE TriggerId = @tid AND RecordId = N'LIT-1');

    EXEC dbo.usp_UpsertTriggerFire @TriggerId = @tid, @RecordId = N'LIT-1', @FiredDate = '2026-07-24', @By = N'system';
    DECLARE @afterUpdate INT = (SELECT COUNT(*) FROM dbo.ScheduledTriggerFire WHERE TriggerId = @tid AND RecordId = N'LIT-1');
    DECLARE @lastFired DATE = (SELECT LastFiredDate FROM dbo.ScheduledTriggerFire WHERE TriggerId = @tid AND RecordId = N'LIT-1');

    -- Assert — still one row, date advanced to the latest fire.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @afterInsert;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @afterUpdate;
    EXEC tSQLt.AssertEquals @Expected = @expDate, @Actual = @lastFired;
END;
GO
