-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_033_CreateTasks. Drops dbo.Tasks and its indexes.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Tasks', N'U') IS NOT NULL
    DROP TABLE dbo.Tasks;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_033_CreateTasks';
GO
