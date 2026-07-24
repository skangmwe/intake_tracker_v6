-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_084_CreateScheduledTriggerSweepLog.sql.
-- =============================================
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ScheduledTriggerSweepLog_SweepDate' AND object_id = OBJECT_ID(N'dbo.ScheduledTriggerSweepLog'))
    DROP INDEX UX_ScheduledTriggerSweepLog_SweepDate ON dbo.ScheduledTriggerSweepLog;
GO

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'ScheduledTriggerSweepLog' AND schema_id = SCHEMA_ID(N'dbo'))
    DROP TABLE dbo.ScheduledTriggerSweepLog;
GO
