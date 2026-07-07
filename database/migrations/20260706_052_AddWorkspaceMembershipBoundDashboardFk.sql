-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Adds the deferred FK from WorkspaceMembership.BoundDashboardId → SavedDashboard.
--              The nullable BoundDashboardId column was created in slice 1 (migration 004,
--              dbo.WorkspaceMembership) with its FK explicitly deferred to slice 23 "where
--              dbo.SavedDashboard is created" — this migration wires it now that the target
--              table exists. A bound Dashboard-viewer's sole surface is this dashboard (BS §10.4,
--              S16). Also adds a filtered non-clustered index on the FK column (only the small set
--              of rows that actually bind a dashboard) per database-performance.md. Idempotent.
--
--              DIVERGENCE FROM CONTRACT §2: the frozen contract stated BoundDashboardId is on
--              dbo.Users. The real schema places it on dbo.WorkspaceMembership (migration 004,
--              data-model.md §WorkspaceMembership) — a dashboard binding is per-membership, not
--              per-user. The FK therefore targets WorkspaceMembership; see the contract's
--              ## Divergences section.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_WorkspaceMembership_SavedDashboard'
      AND parent_object_id = OBJECT_ID(N'dbo.WorkspaceMembership'))
    ALTER TABLE dbo.WorkspaceMembership
        ADD CONSTRAINT FK_WorkspaceMembership_SavedDashboard
        FOREIGN KEY (BoundDashboardId)
        REFERENCES dbo.SavedDashboard (SavedDashboardId) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

-- FK index (filtered — only bound memberships carry a dashboard id).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WorkspaceMembership_BoundDashboardId' AND object_id = OBJECT_ID(N'dbo.WorkspaceMembership'))
    CREATE NONCLUSTERED INDEX IX_WorkspaceMembership_BoundDashboardId
        ON dbo.WorkspaceMembership (BoundDashboardId) WHERE BoundDashboardId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_052_AddWorkspaceMembershipBoundDashboardFk')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260706_052_AddWorkspaceMembershipBoundDashboardFk', SUSER_SNAME(), N'Slice 23 — WorkspaceMembership.BoundDashboardId FK → SavedDashboard.');
END;
GO
