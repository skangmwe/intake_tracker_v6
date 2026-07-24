-- =============================================
-- Author:      /dev-build-application (Slice 1a — Custom-object records: storage & schema)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_077_AddObjectKeyToObjectDefinition — drops the unique slug
--              index and the ObjectKey column, and removes the migration-history row. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Workspace_ObjectKey ON dbo.ObjectDefinition;
GO

IF COL_LENGTH(N'dbo.ObjectDefinition', N'ObjectKey') IS NOT NULL
    ALTER TABLE dbo.ObjectDefinition DROP COLUMN ObjectKey;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_077_AddObjectKeyToObjectDefinition';
GO
