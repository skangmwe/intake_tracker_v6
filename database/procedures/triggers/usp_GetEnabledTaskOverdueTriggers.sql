-- =============================================
-- Author:      /dev-build-application (Slice: task-overdue-trigger, Task 4.3)
-- Create Date: 2026-07-25
-- Description: Returns every enabled, non-deleted built-in 'TaskOverdue' trigger. These carry no authored
--              conditions — the usp_GetTriggerCandidates Task pre-filter (open task, due date passed) is the
--              whole "when" — so ConditionsJson is returned as an empty array to satisfy the shared
--              EnabledTriggerRow bind; the evaluator's TaskOverdue branch does not read it. Authored triggers
--              come from usp_GetEnabledAuthoredTriggers; the two families sweep in one pass.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetEnabledTaskOverdueTriggers
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT
        t.TriggerId,
        t.WorkspaceId,
        t.ObjectType,
        t.Kind,
        t.Name,
        t.Cadence,
        t.RepeatIntervalDays,
        t.NotificationCategory,
        t.Recipients,
        t.NotificationTitle,
        t.NotificationBody,
        ConditionsJson = N'[]'
    FROM dbo.ScheduledTrigger AS t
    WHERE t.IsEnabled = 1
      AND t.IsDeleted = 0
      AND t.Kind = N'TaskOverdue';
END;
GO
