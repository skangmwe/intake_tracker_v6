-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_047_CreateImportRows. Drops dbo.ImportRows and its history row.
--              Idempotent. Run before the 046 rollback (ImportRows FKs Imports).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ImportRows', N'U') IS NOT NULL
    DROP TABLE dbo.ImportRows;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_047_CreateImportRows')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_047_CreateImportRows';
GO
