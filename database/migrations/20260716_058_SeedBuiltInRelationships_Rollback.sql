-- =============================================
-- Author:      /dev-build-application (Slice 25)
-- Create Date: 2026-07-16
-- Description: Rollback for 20260716_058_SeedBuiltInRelationships. Hard-deletes the
--              seeded IsSystem=1 Request→Task rows (harmlessly no-ops if 055 was already
--              rolled back — the table would not exist). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Relationships', N'U') IS NOT NULL
BEGIN
    DELETE FROM dbo.Relationships
     WHERE IsSystem       = 1
       AND FromObjectType = N'Request'
       AND ToObjectType   = N'Task'
       AND Name           = N'Request has Tasks';
END;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_058_SeedBuiltInRelationships')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_058_SeedBuiltInRelationships';
GO
