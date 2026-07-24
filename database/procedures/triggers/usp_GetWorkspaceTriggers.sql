-- =============================================
-- Author:      /dev-build-application (Slice: triggers-request-authoring, Task 2.1)
-- Create Date: 2026-07-24
-- Description: All non-deleted triggers in a workspace (enabled and disabled) with their conditions rolled
--              up as JSON — backs the admin triggers list and editor. Newest first.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceTriggers
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        t.TriggerId,
        t.WorkspaceId,
        t.ObjectType,
        t.Kind,
        t.Name,
        t.IsEnabled,
        t.Cadence,
        t.RepeatIntervalDays,
        t.WindowDays,
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
    WHERE t.WorkspaceId = @Ws
      AND t.IsDeleted = 0
    ORDER BY t.CreatedAt DESC;
END;
GO
