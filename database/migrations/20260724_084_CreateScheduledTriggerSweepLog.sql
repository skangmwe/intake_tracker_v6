-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: The ScheduledTriggerSweepLog table (design spec §3.4). One row per calendar date the
--              daily trigger sweep has run. The BackgroundService polls more often than daily but only
--              evaluates once per day: if no row exists for today AND the configured hour has arrived,
--              it runs the sweep and records the row. This guarantees a restart never double-fires and
--              a missed hour still runs late that day. Global (not per-workspace) — one sweep pass
--              processes every workspace's enabled triggers; per-workspace timing is a later enhancement.
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'ScheduledTriggerSweepLog' AND schema_id = SCHEMA_ID(N'dbo'))
BEGIN
    CREATE TABLE dbo.ScheduledTriggerSweepLog
    (
        SweepLogId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ScheduledTriggerSweepLog_SweepLogId DEFAULT NEWSEQUENTIALID(),
        SweepDate   DATE             NOT NULL,
        RanAt       DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTriggerSweepLog_RanAt DEFAULT SYSUTCDATETIME(),
        -- Bookkeeping — how many triggers were evaluated / fired this sweep (observability, no PII).
        TriggersEvaluated INT         NOT NULL CONSTRAINT DF_ScheduledTriggerSweepLog_TriggersEvaluated DEFAULT 0,
        RecordsFired      INT         NOT NULL CONSTRAINT DF_ScheduledTriggerSweepLog_RecordsFired DEFAULT 0,

        CreatedAt   DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTriggerSweepLog_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt   DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTriggerSweepLog_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy   NVARCHAR(256)    NOT NULL,
        UpdatedBy   NVARCHAR(256)    NOT NULL,
        IsDeleted   BIT              NOT NULL CONSTRAINT DF_ScheduledTriggerSweepLog_IsDeleted DEFAULT 0,
        DeletedAt   DATETIME2        NULL,

        CONSTRAINT PK_ScheduledTriggerSweepLog PRIMARY KEY CLUSTERED (SweepLogId)
    );
END;
GO

-- One live sweep row per calendar date (the once-per-day guard).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ScheduledTriggerSweepLog_SweepDate' AND object_id = OBJECT_ID(N'dbo.ScheduledTriggerSweepLog'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ScheduledTriggerSweepLog_SweepDate
        ON dbo.ScheduledTriggerSweepLog (SweepDate) WHERE IsDeleted = 0;
GO
