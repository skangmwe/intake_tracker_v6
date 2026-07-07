-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Rollback for 20260706_053_SeedDashboards. Removes the four seeded starter
--              dashboards by their fixed GUIDs and the migration-history row. Idempotent.
--              Template-clone copies made by usp_ProvisionWorkspace carry fresh GUIDs and are
--              intentionally NOT removed here (they belong to live provisioned workspaces).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DELETE FROM dbo.SavedDashboard
WHERE SavedDashboardId IN (
    N'DA5B0000-0000-4000-8000-000000000001',
    N'DA5B0000-0000-4000-8000-000000000002',
    N'DA5B0000-0000-4000-8000-000000000003',
    N'DA5B0000-0000-4000-8000-000000000004'
);
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_053_SeedDashboards')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_053_SeedDashboards';
GO
