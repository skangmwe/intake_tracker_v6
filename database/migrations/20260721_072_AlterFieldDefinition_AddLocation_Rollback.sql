-- =============================================
-- Author:      /dev-build-application (Slice — Fields tab reconciliation)
-- Create Date: 2026-07-21
-- Description: Rollback for 20260721_072 — drops the global-key unique index, the Location
--              domain check, its default constraint, and the Location column. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Global_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX UX_FieldDefinition_Global_Object_Key ON dbo.FieldDefinition;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FieldDefinition_Location' AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT CK_FieldDefinition_Location;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_FieldDefinition_Location' AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT DF_FieldDefinition_Location;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'Location') IS NOT NULL
    ALTER TABLE dbo.FieldDefinition DROP COLUMN Location;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_072_AlterFieldDefinition_AddLocation';
GO
