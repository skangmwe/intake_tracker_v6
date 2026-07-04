-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_034_CreateTaskBundleTemplate. Drops the table and its indexes.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.TaskBundleTemplate', N'U') IS NOT NULL
    DROP TABLE dbo.TaskBundleTemplate;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_034_CreateTaskBundleTemplate';
GO
