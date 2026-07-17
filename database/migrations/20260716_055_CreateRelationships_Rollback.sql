-- =============================================
-- Author:      /dev-build-application (Slice 25)
-- Create Date: 2026-07-16
-- Description: Rollback for 20260716_055_CreateRelationships. Drops dbo.Relationships and
--              removes the migration-history row. Idempotent. Nothing outside Slice 25
--              references this table (RecordLinks does, but that arrives in migration 059;
--              rolling back 055 must roll back 059 first).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Relationships', N'U') IS NOT NULL
    DROP TABLE dbo.Relationships;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_055_CreateRelationships')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_055_CreateRelationships';
GO
