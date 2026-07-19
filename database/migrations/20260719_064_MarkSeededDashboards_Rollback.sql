-- =============================================
-- Author:      /dev-build-application (Slice 28 — Multi-dashboard composer)
-- Create Date: 2026-07-19
-- Description: Rollback for 20260719_064. Resets the four seeded starter dashboards to IsSeeded = 0.
--              Visibility / LayoutMode are left as-is (their column defaults, unchanged by this
--              migration's forward semantics beyond the seed flip). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @AiDefaultId  UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000001';
DECLARE @AiWorkloadId UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000002';
DECLARE @FeatureCatId UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000003';
DECLARE @PgStarterId  UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000004';

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.SavedDashboard') AND name = N'IsSeeded')
        UPDATE dbo.SavedDashboard
        SET IsSeeded = 0
        WHERE SavedDashboardId IN (@AiDefaultId, @AiWorkloadId, @FeatureCatId, @PgStarterId);

    DELETE FROM dbo.MigrationHistory
    WHERE MigrationId = N'20260719_064_MarkSeededDashboards';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
