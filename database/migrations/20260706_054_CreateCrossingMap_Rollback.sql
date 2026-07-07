-- =============================================
-- Author:      /dev-build-application (Slice 24 — admin-editable crossing map, S35)
-- Create Date: 2026-07-06
-- Description: Rollback for 20260706_054_CreateCrossingMap. Drops the CrossingMap table (and its
--              indexes with it) and removes the migration-history row. Idempotent. Nothing references
--              this table, so it drops cleanly.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.CrossingMap', N'U') IS NOT NULL
    DROP TABLE dbo.CrossingMap;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_054_CreateCrossingMap')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_054_CreateCrossingMap';
GO
