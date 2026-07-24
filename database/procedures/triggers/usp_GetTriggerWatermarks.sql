-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.3)
-- Create Date: 2026-07-24
-- Description: The fire watermarks for one trigger (RecordId + last-fired date). The evaluator reads the
--              whole set once per trigger per sweep (avoids an N+1 per-record query) and applies the
--              cadence rule: Once -> a present row blocks re-fire; RepeatEveryNDays -> re-fire when
--              LastFiredDate + interval <= today.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTriggerWatermarks
    @TriggerId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Trigger UNIQUEIDENTIFIER = @TriggerId;

    SELECT f.RecordId, f.LastFiredDate
    FROM dbo.ScheduledTriggerFire AS f
    WHERE f.TriggerId = @Trigger
      AND f.IsDeleted = 0;
END;
GO
