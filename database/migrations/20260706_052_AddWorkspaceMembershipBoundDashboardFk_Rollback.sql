-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Rollback for 20260706_052. Drops the WorkspaceMembership.BoundDashboardId FK and
--              its filtered index, and removes the migration-history row. Leaves the nullable
--              BoundDashboardId column in place (it was created in slice 1, migration 004).
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_WorkspaceMembership_SavedDashboard'
      AND parent_object_id = OBJECT_ID(N'dbo.WorkspaceMembership'))
    ALTER TABLE dbo.WorkspaceMembership DROP CONSTRAINT FK_WorkspaceMembership_SavedDashboard;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WorkspaceMembership_BoundDashboardId' AND object_id = OBJECT_ID(N'dbo.WorkspaceMembership'))
    DROP INDEX IX_WorkspaceMembership_BoundDashboardId ON dbo.WorkspaceMembership;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_052_AddWorkspaceMembershipBoundDashboardFk')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_052_AddWorkspaceMembershipBoundDashboardFk';
GO
