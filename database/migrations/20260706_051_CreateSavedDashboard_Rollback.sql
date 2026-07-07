-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Rollback for 20260706_051_CreateSavedDashboard. Drops the SavedDashboard table
--              (and its indexes with it) and removes the migration-history row. Idempotent.
--              NOTE: the WorkspaceMembership.BoundDashboardId FK (migration 052) references this
--              table — roll 052 back first, or this DROP fails on the dependent constraint.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SavedDashboard', N'U') IS NOT NULL
    DROP TABLE dbo.SavedDashboard;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_051_CreateSavedDashboard')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_051_CreateSavedDashboard';
GO
