-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.3)
-- Create Date: 2026-07-24
-- Description: Record the sweep's counts on today's sweep-log row (observability only — no PII).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_FinalizeTriggerSweep
    @Today      DATE,
    @Evaluated  INT,
    @Fired      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    UPDATE dbo.ScheduledTriggerSweepLog
    SET TriggersEvaluated = @Evaluated,
        RecordsFired      = @Fired,
        UpdatedAt         = SYSUTCDATETIME(),
        UpdatedBy         = N'system'
    WHERE SweepDate = @Today AND IsDeleted = 0;
END;
GO
