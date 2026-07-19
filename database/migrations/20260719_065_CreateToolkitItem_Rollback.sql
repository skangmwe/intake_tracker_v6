-- =============================================
-- Author:      /dev-build-application (Slice 29 — Toolkit object + S43 surface)
-- Create Date: 2026-07-19
-- Description: Rollback for 20260719_065_CreateToolkitItem. Drops the ToolkitItem table (indexes
--              fall with it) and removes the migration-history row. Idempotent per
--              database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ToolkitItem', N'U') IS NOT NULL
    DROP TABLE dbo.ToolkitItem;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260719_065_CreateToolkitItem')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260719_065_CreateToolkitItem';
GO
