-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: DATA migration (separate from schema per database-migrations.md).
--              Seeds the two foundation workspaces — the central AI Solutions
--              workspace and the PG/Dept template that named practice groups are
--              cloned from (BS §1.1) — plus their PrefixRegistry rows. Idempotent:
--              guarded by NOT EXISTS on the fixed seed GUIDs so re-running does not
--              duplicate.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @AiWorkspaceId   UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001';
DECLARE @TemplateId      UNIQUEIDENTIFIER = N'9C700000-0000-4000-8000-000000000001';
DECLARE @Seed            NVARCHAR(256)    = N'system-seed';

BEGIN TRY
    BEGIN TRANSACTION;

    -- AI Solutions workspace.
    IF NOT EXISTS (SELECT 1 FROM dbo.Workspaces WHERE WorkspaceId = @AiWorkspaceId)
        INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, CreatedBy, UpdatedBy)
        VALUES (@AiWorkspaceId, N'AI Solutions', N'ai-solutions', N'AIS', 0, @Seed, @Seed);

    -- PG/Dept template workspace.
    IF NOT EXISTS (SELECT 1 FROM dbo.Workspaces WHERE WorkspaceId = @TemplateId)
        INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, CreatedBy, UpdatedBy)
        VALUES (@TemplateId, N'PG / Department Template', N'pg-dept-template', N'TMPL', 0, @Seed, @Seed);

    -- PrefixRegistry rows (prefix -> workspace, with name at mint time).
    IF NOT EXISTS (SELECT 1 FROM dbo.PrefixRegistry WHERE Prefix = N'AIS')
        INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, CreatedBy, UpdatedBy)
        VALUES (N'AIS', @AiWorkspaceId, N'AI Solutions', @Seed, @Seed);

    IF NOT EXISTS (SELECT 1 FROM dbo.PrefixRegistry WHERE Prefix = N'TMPL')
        INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, CreatedBy, UpdatedBy)
        VALUES (N'TMPL', @TemplateId, N'PG / Department Template', @Seed, @Seed);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_010_SeedWorkspaces')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260703_010_SeedWorkspaces', SUSER_SNAME(), N'Slice 1 — seed AI Solutions + PG/Dept template workspaces + prefixes.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
