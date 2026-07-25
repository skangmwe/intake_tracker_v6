-- =============================================
-- Author:      /dev-build-application (Time-based triggers — Slice 5, Approval respond-by)
-- Create Date: 2026-07-25
-- Description: Adds dbo.Workspaces.ApprovalRespondByDays — the workspace-level window (in days) used to
--              default an approval gate's RespondByDate from its OpenedAt (BS §7 / §16, Open Q3 resolved:
--              seed 5, admin-adjustable per workspace later). When usp_OpenGate opens a gate it sets
--              RespondByDate = OpenedAt + ApprovalRespondByDays. A single per-workspace config value;
--              no admin-editor surface this cycle (read as-is). NOT NULL with a default so every existing
--              and future workspace has a concrete window. Mirrors the DueSoonWindowDays /
--              BenefitReviewOffsetDays column precedents. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Workspaces', N'ApprovalRespondByDays') IS NULL
    ALTER TABLE dbo.Workspaces
        ADD ApprovalRespondByDays INT NOT NULL
            CONSTRAINT DF_Workspaces_ApprovalRespondByDays DEFAULT 5;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_092_AlterWorkspaces_AddApprovalRespondByDays')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260725_092_AlterWorkspaces_AddApprovalRespondByDays', SUSER_SNAME(), N'Slice 5 — Workspaces.ApprovalRespondByDays (approval respond-by window, default 5).');
END;
GO
