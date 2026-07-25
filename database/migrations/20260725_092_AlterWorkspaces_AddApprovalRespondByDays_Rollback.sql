-- =============================================
-- Author:      /dev-build-application (Time-based triggers — Slice 5, Approval respond-by)
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_092 — drop the default constraint and the
--              dbo.Workspaces.ApprovalRespondByDays column. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Workspaces_ApprovalRespondByDays')
    ALTER TABLE dbo.Workspaces DROP CONSTRAINT DF_Workspaces_ApprovalRespondByDays;
GO

IF COL_LENGTH(N'dbo.Workspaces', N'ApprovalRespondByDays') IS NOT NULL
    ALTER TABLE dbo.Workspaces DROP COLUMN ApprovalRespondByDays;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_092_AlterWorkspaces_AddApprovalRespondByDays';
GO
