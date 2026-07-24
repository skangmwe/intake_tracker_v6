-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.3)
-- Create Date: 2026-07-24
-- Description: Atomically claim today's daily sweep. The BackgroundService runs in every API replica, so
--              exactly one replica must run the sweep per day. Inserts the sweep-log row for @Today only
--              if none exists; returns Claimed = 1 when this caller won the day, else 0. The unique
--              filtered index on SweepDate is the race backstop — a concurrent insert that loses the race
--              hits a duplicate key and is caught as Claimed = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_TryBeginTriggerSweep
    @Today DATE,
    @By    NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Day   DATE          = @Today;
    DECLARE @Actor NVARCHAR(256) = @By;

    BEGIN TRY
        INSERT INTO dbo.ScheduledTriggerSweepLog (SweepDate, CreatedBy, UpdatedBy)
        SELECT @Day, @Actor, @Actor
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.ScheduledTriggerSweepLog
            WHERE SweepDate = @Day AND IsDeleted = 0);

        SELECT CAST(CASE WHEN @@ROWCOUNT > 0 THEN 1 ELSE 0 END AS BIT) AS Claimed;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627)   -- unique-index violation: another replica claimed today
            SELECT CAST(0 AS BIT) AS Claimed;
        ELSE
            THROW;
    END CATCH;
END;
GO
