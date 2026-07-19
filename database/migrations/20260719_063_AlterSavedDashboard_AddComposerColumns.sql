-- =============================================
-- Author:      /dev-build-application (Slice 28 — Multi-dashboard composer)
-- Create Date: 2026-07-19
-- Description: Extends dbo.SavedDashboard for the S6 multi-dashboard composer (v2-reconciliation.md
--              §Model deltas 7). Adds three columns:
--                • IsSeeded   — 1 on the four seeded starters (read-only on the composer path);
--                               0 on user-composed dashboards. Backfilled to 0; migration 064 flips
--                               the four seed rows to 1.
--                • Visibility — 'Shared' (whole audience) | 'Personal' (author-only). Existing rows
--                               default to 'Shared'.
--                • LayoutMode — 'Fixed' (seeded four-tile/heatmap/grid, code-driven) | 'Composed'
--                               (user-authored via the widget composer). Existing rows default to
--                               'Fixed'.
--              Also relaxes Slug to NULLable: user-composed dashboards carry no slug (only the four
--              seeded starters do). The Slug CHECK is recreated to allow NULL alongside the four
--              seeded values. Idempotent (guards on sys.columns / sys.check_constraints). Each column
--              add and each CHECK add is its own batch (GO-separated) so the CHECK can see the
--              just-added column — mirrors migration 060.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

-- ── IsSeeded ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'IsSeeded')
BEGIN
    ALTER TABLE dbo.SavedDashboard
        ADD IsSeeded BIT NOT NULL CONSTRAINT DF_SavedDashboard_IsSeeded DEFAULT 0;
END;
GO

-- ── Visibility ───────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'Visibility')
BEGIN
    ALTER TABLE dbo.SavedDashboard
        ADD Visibility NVARCHAR(20) NOT NULL CONSTRAINT DF_SavedDashboard_Visibility DEFAULT N'Shared';
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SavedDashboard_Visibility')
BEGIN
    ALTER TABLE dbo.SavedDashboard
        ADD CONSTRAINT CK_SavedDashboard_Visibility CHECK (Visibility IN (N'Shared', N'Personal'));
END;
GO

-- ── LayoutMode ───────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'LayoutMode')
BEGIN
    ALTER TABLE dbo.SavedDashboard
        ADD LayoutMode NVARCHAR(20) NOT NULL CONSTRAINT DF_SavedDashboard_LayoutMode DEFAULT N'Fixed';
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SavedDashboard_LayoutMode')
BEGIN
    ALTER TABLE dbo.SavedDashboard
        ADD CONSTRAINT CK_SavedDashboard_LayoutMode CHECK (LayoutMode IN (N'Fixed', N'Composed'));
END;
GO

-- ── Slug → NULLable + relaxed CHECK (composed dashboards carry no slug) ────
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SavedDashboard_Slug')
    ALTER TABLE dbo.SavedDashboard DROP CONSTRAINT CK_SavedDashboard_Slug;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'Slug' AND is_nullable = 0)
    ALTER TABLE dbo.SavedDashboard ALTER COLUMN Slug NVARCHAR(32) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SavedDashboard_Slug')
BEGIN
    ALTER TABLE dbo.SavedDashboard
        ADD CONSTRAINT CK_SavedDashboard_Slug CHECK
            (Slug IS NULL OR Slug IN (N'ai-default', N'ai-workload', N'feature-catalog', N'pg-starter'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260719_063_AlterSavedDashboard_AddComposerColumns')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260719_063_AlterSavedDashboard_AddComposerColumns', SUSER_SNAME(),
            N'Slice 28 — SavedDashboard composer columns (IsSeeded/Visibility/LayoutMode) + nullable Slug.');
GO
