-- =============================================
-- Author:      import-upsert
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_097 — drops CreatedRows / UpdatedRows from dbo.Imports. Idempotent.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Imports', N'UpdatedRows') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Imports DROP CONSTRAINT DF_Imports_UpdatedRows;
    ALTER TABLE dbo.Imports DROP COLUMN UpdatedRows;
END;
GO
IF COL_LENGTH(N'dbo.Imports', N'CreatedRows') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Imports DROP CONSTRAINT DF_Imports_CreatedRows;
    ALTER TABLE dbo.Imports DROP COLUMN CreatedRows;
END;
GO
DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_099_AlterImports_AddUpsertCounts';
GO
