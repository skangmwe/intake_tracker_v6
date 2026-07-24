-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_083_CreateScheduledTriggerFires.sql.
-- =============================================
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ScheduledTriggerFire_TriggerRecord' AND object_id = OBJECT_ID(N'dbo.ScheduledTriggerFire'))
    DROP INDEX UX_ScheduledTriggerFire_TriggerRecord ON dbo.ScheduledTriggerFire;
GO

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'ScheduledTriggerFire' AND schema_id = SCHEMA_ID(N'dbo'))
    DROP TABLE dbo.ScheduledTriggerFire;
GO
