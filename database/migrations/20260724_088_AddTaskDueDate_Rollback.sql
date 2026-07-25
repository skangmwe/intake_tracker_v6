-- =============================================
-- Author:      Slice 4a — Task Due Date
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_088_AddTaskDueDate. Drops dbo.Tasks.DueDate and removes the
--              migration-history row. Idempotent — safe to re-run (COL_LENGTH guard).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Tasks', N'DueDate') IS NOT NULL
    ALTER TABLE dbo.Tasks DROP COLUMN DueDate;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_088_AddTaskDueDate';
GO
