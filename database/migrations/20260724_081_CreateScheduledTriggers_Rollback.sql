-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_081_CreateScheduledTriggers.sql. Drops the index then the table.
-- =============================================
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ScheduledTrigger_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.ScheduledTrigger'))
    DROP INDEX IX_ScheduledTrigger_WorkspaceId ON dbo.ScheduledTrigger;
GO

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'ScheduledTrigger' AND schema_id = SCHEMA_ID(N'dbo'))
    DROP TABLE dbo.ScheduledTrigger;
GO
