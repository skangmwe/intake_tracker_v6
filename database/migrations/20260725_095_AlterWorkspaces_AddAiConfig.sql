-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 1 foundation)
-- Create Date: 2026-07-25
-- Description: Adds the workspace AI-assist configuration to dbo.Workspaces (BS §14):
--                • AiAssistEnabled       — the off-switch. Default 0 (OFF) so the AI layer is opt-in
--                                          per workspace; nothing changes until an admin enables it.
--                • AiContentFieldAllowlist — JSON array of the content-field keys the AI layer may
--                                          read and send to a provider. Default the three non-PII
--                                          intake fields; client/matter numbers and identities are
--                                          deliberately excluded so they can never leave the system.
--              One logical concern (the workspace AI config), NOT NULL with defaults so every existing
--              and future workspace has concrete values. Mirrors the DueSoonWindowDays / BenefitReviewOffsetDays
--              column precedents (migrations 049 / 087). Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Workspaces', N'AiAssistEnabled') IS NULL
    ALTER TABLE dbo.Workspaces
        ADD AiAssistEnabled BIT NOT NULL
            CONSTRAINT DF_Workspaces_AiAssistEnabled DEFAULT 0;
GO

IF COL_LENGTH(N'dbo.Workspaces', N'AiContentFieldAllowlist') IS NULL
    ALTER TABLE dbo.Workspaces
        ADD AiContentFieldAllowlist NVARCHAR(MAX) NOT NULL
            CONSTRAINT DF_Workspaces_AiContentFieldAllowlist DEFAULT N'["Name","Description","WorkflowDetails"]';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_095_AlterWorkspaces_AddAiConfig')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260725_095_AlterWorkspaces_AddAiConfig', SUSER_SNAME(), N'Phase 4 Slice 1 — Workspaces AI off-switch (default OFF) + content-field allowlist.');
END;
GO
