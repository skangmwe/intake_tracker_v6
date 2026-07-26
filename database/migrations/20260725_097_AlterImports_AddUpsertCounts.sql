-- =============================================
-- Author:      import-upsert
-- Create Date: 2026-07-25
-- Description: Adds CreatedRows / UpdatedRows to dbo.Imports so an upsert import can report how many
--              records were created vs updated (custom-object import upsert). Backfills as 0 (existing
--              create-only imports = all created). Idempotent per database-migrations.md.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Imports', N'CreatedRows') IS NULL
    ALTER TABLE dbo.Imports ADD CreatedRows INT NOT NULL CONSTRAINT DF_Imports_CreatedRows DEFAULT 0;
GO
IF COL_LENGTH(N'dbo.Imports', N'UpdatedRows') IS NULL
    ALTER TABLE dbo.Imports ADD UpdatedRows INT NOT NULL CONSTRAINT DF_Imports_UpdatedRows DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_097_AlterImports_AddUpsertCounts')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260725_097_AlterImports_AddUpsertCounts', SUSER_SNAME(), N'Import upsert — CreatedRows/UpdatedRows on dbo.Imports.');
GO
