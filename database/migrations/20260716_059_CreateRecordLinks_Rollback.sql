-- =============================================
-- Author:      /dev-build-application (Slice 25)
-- Create Date: 2026-07-16
-- Description: Rollback for 20260716_059_CreateRecordLinks. Drops RecordLinks (and its
--              indexes) and removes the migration-history row. Idempotent. Must run
--              before the Relationships table is dropped (FK dependency).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.RecordLinks', N'U') IS NOT NULL
    DROP TABLE dbo.RecordLinks;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_059_CreateRecordLinks')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_059_CreateRecordLinks';
GO
