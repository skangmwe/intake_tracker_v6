-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_044_CreateFeatures. Drops the Features table (and its
--              indexes with it) and removes the migration-history row. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Features', N'U') IS NOT NULL
    DROP TABLE dbo.Features;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_044_CreateFeatures')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_044_CreateFeatures';
GO
