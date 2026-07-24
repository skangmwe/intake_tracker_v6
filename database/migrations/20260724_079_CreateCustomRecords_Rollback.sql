-- =============================================
-- Author:      /dev-build-application (Slice 1b — Custom-object records: record CRUD API)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_079_CreateCustomRecords — drops the table (indexes and
--              constraints go with it) and removes the migration-history row. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DROP TABLE IF EXISTS dbo.CustomRecords;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_079_CreateCustomRecords';
GO
