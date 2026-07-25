-- =============================================
-- Author:      /dev-build-application (Slice: task-overdue-trigger, Task 4.3)
-- Create Date: 2026-07-25
-- Description: Seed the built-in Task-overdue trigger in the AI Solutions workspace, DISABLED (opt-in — no
--              surprise notifications on first deploy; design spec Open Q4). A fixed GUID makes the seed
--              idempotent. This is a Kind = 'TaskOverdue' trigger: it carries NO authored conditions (the
--              candidate pre-filter — open task with a passed due date — is the whole "when") and its
--              recipient is resolved at fire time from each overdue task's assignee, so Recipients is an
--              empty array. Repeats daily until the task clears (task-overdue category).
-- =============================================
DECLARE @Ws              UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001';
DECLARE @TaskOvrTrigger  UNIQUEIDENTIFIER = N'F1A00000-0000-4000-8000-000000000003';

IF NOT EXISTS (SELECT 1 FROM dbo.ScheduledTrigger WHERE TriggerId = @TaskOvrTrigger)
BEGIN
    INSERT INTO dbo.ScheduledTrigger
        (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence, RepeatIntervalDays, WindowDays,
         NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy)
    VALUES
        (@TaskOvrTrigger, @Ws, N'Task', N'TaskOverdue', N'Overdue task reminder', 0, N'RepeatEveryNDays', 1, NULL,
         N'task-overdue', N'[]', N'A task is overdue',
         N'This task has passed its due date and is still open.', N'system', N'system');
END;
GO
