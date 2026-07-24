-- =============================================
-- Author:      /dev-build-application (Time-based triggers — Slice 3, Benefit-review-date default)
-- Create Date: 2026-07-24
-- Description: Adds dbo.Workspaces.BenefitReviewOffsetDays — the workspace-level offset (in days) used
--              to default a request's Benefit-review date from its Deploy Date (BS §17.11 / §16).
--              When a request's deployDate is set/changed and its benefitReviewDate has not been
--              manually overridden, the API sets benefitReviewDate = deployDate + BenefitReviewOffsetDays.
--              A single per-workspace config value (default 90 days); no admin-editor surface this cycle
--              (the column is read as-is). NOT NULL with a default so every existing and future workspace
--              has a concrete offset. Mirrors the DueSoonWindowDays column precedent (migration 049).
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Workspaces', N'BenefitReviewOffsetDays') IS NULL
    ALTER TABLE dbo.Workspaces
        ADD BenefitReviewOffsetDays INT NOT NULL
            CONSTRAINT DF_Workspaces_BenefitReviewOffsetDays DEFAULT 90;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_087_AlterWorkspaces_AddBenefitReviewOffsetDays')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260724_087_AlterWorkspaces_AddBenefitReviewOffsetDays', SUSER_SNAME(), N'Slice 3 — Workspaces.BenefitReviewOffsetDays (Benefit-review-date default offset).');
END;
GO
