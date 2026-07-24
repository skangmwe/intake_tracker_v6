-- =============================================
-- Author:      /dev-build-application (Slice: triggers-request-authoring, Task 2.1)
-- Create Date: 2026-07-24
-- Description: One non-deleted trigger by id, scoped to its workspace (so a caller cannot read a trigger
--              from another workspace by guessing the id), with its conditions rolled up. Empty result
--              when the id does not exist in the workspace.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetScheduledTriggerById
    @TriggerId   UNIQUEIDENTIFIER,
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Trigger UNIQUEIDENTIFIER = @TriggerId;
    DECLARE @Ws      UNIQUEIDENTIFIER = @WorkspaceId;

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
    WHERE t.TriggerId = @Trigger
      AND t.WorkspaceId = @Ws
      AND t.IsDeleted = 0;
END;
GO
