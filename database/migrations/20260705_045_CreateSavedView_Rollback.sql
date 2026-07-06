-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_045_CreateSavedView. Drops the SavedView table (and its
--              indexes with it) and removes the migration-history row. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SavedView', N'U') IS NOT NULL
    DROP TABLE dbo.SavedView;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_045_CreateSavedView')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_045_CreateSavedView';
GO
