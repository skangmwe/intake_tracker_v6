-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_010_SeedWorkspaces. Idempotent — removes only
--              the seeded rows (by fixed prefix / GUID), leaving user-created data.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DELETE FROM dbo.PrefixRegistry WHERE Prefix IN (N'AIS', N'TMPL');
DELETE FROM dbo.Workspaces WHERE WorkspaceId IN (N'1A150000-0000-4000-8000-000000000001', N'9C700000-0000-4000-8000-000000000001');
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_010_SeedWorkspaces';
GO
