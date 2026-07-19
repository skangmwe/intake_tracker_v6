-- =============================================
-- Author:      /dev-build-application (Slice 28 — Multi-dashboard composer)
-- Create Date: 2026-07-19
-- Description: Rollback for 20260719_063. Drops the composer columns (IsSeeded / Visibility /
--              LayoutMode) and their constraints, and restores Slug to NOT NULL with the original
--              four-value CHECK. NOTE: restoring Slug NOT NULL requires that no user-composed
--              (NULL-slug) rows exist — the caller must first delete composed dashboards (or run
--              the 064 rollback and remove composed rows). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    -- ── Restore Slug NOT NULL + original CHECK ───────────────────────────────
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SavedDashboard_Slug')
        ALTER TABLE dbo.SavedDashboard DROP CONSTRAINT CK_SavedDashboard_Slug;

    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'Slug' AND is_nullable = 1)
        ALTER TABLE dbo.SavedDashboard ALTER COLUMN Slug NVARCHAR(32) NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SavedDashboard_Slug')
        ALTER TABLE dbo.SavedDashboard
            ADD CONSTRAINT CK_SavedDashboard_Slug CHECK
                (Slug IN (N'ai-default', N'ai-workload', N'feature-catalog', N'pg-starter'));

    -- ── Drop LayoutMode ──────────────────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SavedDashboard_LayoutMode')
        ALTER TABLE dbo.SavedDashboard DROP CONSTRAINT CK_SavedDashboard_LayoutMode;
    IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_SavedDashboard_LayoutMode')
        ALTER TABLE dbo.SavedDashboard DROP CONSTRAINT DF_SavedDashboard_LayoutMode;
    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'LayoutMode')
        ALTER TABLE dbo.SavedDashboard DROP COLUMN LayoutMode;

    -- ── Drop Visibility ──────────────────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SavedDashboard_Visibility')
        ALTER TABLE dbo.SavedDashboard DROP CONSTRAINT CK_SavedDashboard_Visibility;
    IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_SavedDashboard_Visibility')
        ALTER TABLE dbo.SavedDashboard DROP CONSTRAINT DF_SavedDashboard_Visibility;
    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'Visibility')
        ALTER TABLE dbo.SavedDashboard DROP COLUMN Visibility;

    -- ── Drop IsSeeded ────────────────────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_SavedDashboard_IsSeeded')
        ALTER TABLE dbo.SavedDashboard DROP CONSTRAINT DF_SavedDashboard_IsSeeded;
    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'IsSeeded')
        ALTER TABLE dbo.SavedDashboard DROP COLUMN IsSeeded;

    DELETE FROM dbo.MigrationHistory
    WHERE MigrationId = N'20260719_063_AlterSavedDashboard_AddComposerColumns';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
