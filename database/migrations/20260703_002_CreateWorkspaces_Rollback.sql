-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_002_CreateWorkspaces. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Workspaces_Prefix' AND object_id = OBJECT_ID(N'dbo.Workspaces'))
    DROP INDEX UX_Workspaces_Prefix ON dbo.Workspaces;
GO

IF OBJECT_ID(N'dbo.Workspaces', N'U') IS NOT NULL
    DROP TABLE dbo.Workspaces;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_002_CreateWorkspaces';
GO
