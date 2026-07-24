-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_082_CreateScheduledTriggerConditions.sql.
-- =============================================
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ScheduledTriggerCondition_TriggerId' AND object_id = OBJECT_ID(N'dbo.ScheduledTriggerCondition'))
    DROP INDEX IX_ScheduledTriggerCondition_TriggerId ON dbo.ScheduledTriggerCondition;
GO

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'ScheduledTriggerCondition' AND schema_id = SCHEMA_ID(N'dbo'))
    DROP TABLE dbo.ScheduledTriggerCondition;
GO
