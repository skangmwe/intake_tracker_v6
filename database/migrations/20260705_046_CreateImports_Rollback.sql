-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_046_CreateImports. Drops dbo.Imports and its history row.
--              Idempotent. Drop ImportRows (migration 047) first — it FKs Imports.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Imports', N'U') IS NOT NULL
    DROP TABLE dbo.Imports;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_046_CreateImports')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_046_CreateImports';
GO
