-- =============================================
-- Author:      /dev-build-application (Slice: approval-respond-by, Task 5.2)
-- Create Date: 2026-07-25
-- Description: Returns every enabled, non-deleted built-in 'ApprovalOverdue' trigger. These carry no
--              authored conditions — the usp_GetTriggerCandidates Approval pre-filter (unresolved gate,
--              respond-by date passed) is the whole "when" — so ConditionsJson is returned as an empty
--              array to satisfy the shared EnabledTriggerRow bind; the evaluator's ApprovalOverdue branch
--              does not read it. Mirrors usp_GetEnabledTaskOverdueTriggers; the built-in families each
--              have their own getter and the evaluator sweeps them alongside the authored triggers.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetEnabledApprovalOverdueTriggers
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
      AND t.Kind = N'ApprovalOverdue';
END;
GO
