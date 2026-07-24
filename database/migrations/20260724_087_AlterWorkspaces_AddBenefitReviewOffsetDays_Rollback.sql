-- =============================================
-- Author:      /dev-build-application (Time-based triggers — Slice 3, Benefit-review-date default)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_087 — drops the default constraint then the column. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_Workspaces_BenefitReviewOffsetDays')
    ALTER TABLE dbo.Workspaces DROP CONSTRAINT DF_Workspaces_BenefitReviewOffsetDays;
GO

IF COL_LENGTH(N'dbo.Workspaces', N'BenefitReviewOffsetDays') IS NOT NULL
    ALTER TABLE dbo.Workspaces DROP COLUMN BenefitReviewOffsetDays;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_087_AlterWorkspaces_AddBenefitReviewOffsetDays';
GO
