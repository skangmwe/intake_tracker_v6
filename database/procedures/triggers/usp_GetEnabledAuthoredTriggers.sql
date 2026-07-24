-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.3)
-- Create Date: 2026-07-24
-- Description: Returns every enabled, non-deleted 'Authored' trigger with its ANDed "when" rows rolled
--              up as a JSON array (whenFieldKey/comparator/compareValue), ordered by SortOrder. The
--              daily sweep evaluates each row's ConditionsJson against candidate records via the
--              ConditionEngine. Built-in Kinds (TaskOverdue/ApprovalOverdue) have their own branches in
--              later slices and are deliberately excluded here.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetEnabledAuthoredTriggers
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
        ConditionsJson = ISNULL((
            SELECT c.WhenFieldKey AS whenFieldKey,
                   c.Comparator   AS comparator,
                   c.CompareValue AS compareValue
            FROM dbo.ScheduledTriggerCondition AS c
            WHERE c.TriggerId = t.TriggerId
              AND c.IsDeleted = 0
            ORDER BY c.SortOrder
            FOR JSON PATH), N'[]')
    FROM dbo.ScheduledTrigger AS t
    WHERE t.IsEnabled = 1
      AND t.IsDeleted = 0
      AND t.Kind = N'Authored';
END;
GO
