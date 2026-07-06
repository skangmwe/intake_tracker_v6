-- =============================================
-- Author:      /dev-build-application (Slice 21 — SLA Status + time-in-stage)
-- Create Date: 2026-07-06
-- Description: Adds dbo.Workspaces.DueSoonWindowDays — the workspace-level "due soon" window (BS §17.2).
--              SLA Status is derived per read: DueDate < today = Overdue; today ≤ DueDate ≤ today +
--              DueSoonWindowDays = Due soon; else On track. The window is a single per-workspace config
--              value (default 3 days); the admin-editor surface is a later slice — this migration only
--              establishes the column + default so the derivation has a source. NOT NULL with a default
--              so every existing and future workspace has a concrete window. Idempotent per
--              database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Workspaces', N'DueSoonWindowDays') IS NULL
    ALTER TABLE dbo.Workspaces
        ADD DueSoonWindowDays INT NOT NULL
            CONSTRAINT DF_Workspaces_DueSoonWindowDays DEFAULT 3;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_049_AlterWorkspaces_AddDueSoonWindowDays')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260706_049_AlterWorkspaces_AddDueSoonWindowDays', SUSER_SNAME(), N'Slice 21 — Workspaces.DueSoonWindowDays (SLA due-soon window).');
END;
GO
