-- =============================================
-- Author:      /dev-build-application (Slice 21 — SLA Status + time-in-stage)
-- Create Date: 2026-07-06
-- Description: Rollback for 20260706_049 — drops the default constraint then the column. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Workspaces_DueSoonWindowDays')
    ALTER TABLE dbo.Workspaces DROP CONSTRAINT DF_Workspaces_DueSoonWindowDays;
GO

IF COL_LENGTH(N'dbo.Workspaces', N'DueSoonWindowDays') IS NOT NULL
    ALTER TABLE dbo.Workspaces DROP COLUMN DueSoonWindowDays;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_049_AlterWorkspaces_AddDueSoonWindowDays';
GO
