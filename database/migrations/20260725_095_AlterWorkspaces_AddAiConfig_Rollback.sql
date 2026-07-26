-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 1 foundation)
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_095 — drops the default constraints then the columns. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Workspaces_AiContentFieldAllowlist')
    ALTER TABLE dbo.Workspaces DROP CONSTRAINT DF_Workspaces_AiContentFieldAllowlist;
GO

IF COL_LENGTH(N'dbo.Workspaces', N'AiContentFieldAllowlist') IS NOT NULL
    ALTER TABLE dbo.Workspaces DROP COLUMN AiContentFieldAllowlist;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Workspaces_AiAssistEnabled')
    ALTER TABLE dbo.Workspaces DROP CONSTRAINT DF_Workspaces_AiAssistEnabled;
GO

IF COL_LENGTH(N'dbo.Workspaces', N'AiAssistEnabled') IS NOT NULL
    ALTER TABLE dbo.Workspaces DROP COLUMN AiAssistEnabled;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_095_AlterWorkspaces_AddAiConfig';
GO
