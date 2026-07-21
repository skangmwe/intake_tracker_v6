-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab)
-- Create Date: 2026-07-20
-- Description: Rollback for 20260720_071_CreateObjectDefinition. Drops dbo.ObjectDefinition
--              and removes the migration-history row. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ObjectDefinition', N'U') IS NOT NULL
    DROP TABLE dbo.ObjectDefinition;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_071_CreateObjectDefinition')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_071_CreateObjectDefinition';
GO
