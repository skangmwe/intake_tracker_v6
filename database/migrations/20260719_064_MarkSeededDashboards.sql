-- =============================================
-- Author:      /dev-build-application (Slice 28 — Multi-dashboard composer)
-- Create Date: 2026-07-19
-- Description: DATA migration (separate from schema per database-migrations.md). Flips the four
--              seeded starter dashboards (seeded by migration 053) to IsSeeded = 1 so the composer
--              path treats them as read-only (PATCH of visibility/widgets → 403). Visibility and
--              LayoutMode already carry the correct defaults from migration 063 ('Shared' / 'Fixed')
--              for these existing rows, so only IsSeeded is set here. Keyed on the fixed seed GUIDs;
--              WHERE IsSeeded = 0 makes it idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @AiDefaultId  UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000001';
DECLARE @AiWorkloadId UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000002';
DECLARE @FeatureCatId UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000003';
DECLARE @PgStarterId  UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000004';

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.SavedDashboard
    SET IsSeeded  = 1,
        LayoutMode = N'Fixed',
        Visibility = N'Shared'
    WHERE SavedDashboardId IN (@AiDefaultId, @AiWorkloadId, @FeatureCatId, @PgStarterId)
      AND IsSeeded = 0;

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260719_064_MarkSeededDashboards')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260719_064_MarkSeededDashboards', SUSER_SNAME(),
                N'Slice 28 — mark the four seeded starter dashboards IsSeeded = 1.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
