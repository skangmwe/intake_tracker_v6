-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Rollback for 20260704_035_SeedTaskBundleTemplates. Removes the three seeded
--              templates from the AI Solutions workspace. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions

IF OBJECT_ID(N'dbo.TaskBundleTemplate', N'U') IS NOT NULL
    DELETE FROM dbo.TaskBundleTemplate
    WHERE WorkspaceId = @Ws
      AND TemplateKey IN (N'extraction-review-build', N'drafting-assistant', N'meeting-driven-engagement');
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_035_SeedTaskBundleTemplates';
GO
