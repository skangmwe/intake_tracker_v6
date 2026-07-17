-- =============================================
-- Author:      /dev-build-application (Slice 25)
-- Create Date: 2026-07-16
-- Description: Rollback for 20260716_056_AlterFieldDefinition_AddLinkToRecordConfig. Drops
--              constraints, indexes, and columns added by that migration and restores the
--              pre-Slice-25 CHECK constraint (Request/Task/Feature only). Idempotent.
--              Runs BEFORE the Relationships table is dropped so the FK falls away first.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_SystemProvisioned' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX IX_FieldDefinition_SystemProvisioned ON dbo.FieldDefinition;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_RelationshipId' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX IX_FieldDefinition_RelationshipId ON dbo.FieldDefinition;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_FieldDefinition_Relationship'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT FK_FieldDefinition_Relationship;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_AllowMultiple'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT CK_FieldDefinition_AllowMultiple;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_TargetObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT CK_FieldDefinition_TargetObjectType;
GO

-- Restore the pre-Slice-25 ObjectType CHECK (Request/Task/Feature only).
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
      AND definition LIKE N'%ToolkitItem%'
)
BEGIN
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT CK_FieldDefinition_ObjectType;
    ALTER TABLE dbo.FieldDefinition
        ADD CONSTRAINT CK_FieldDefinition_ObjectType
        CHECK (ObjectType IN (N'Request', N'Task', N'Feature'));
END;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'RelationshipId') IS NOT NULL
    ALTER TABLE dbo.FieldDefinition DROP COLUMN RelationshipId;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'ReverseLinkLabel') IS NOT NULL
    ALTER TABLE dbo.FieldDefinition DROP COLUMN ReverseLinkLabel;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'AllowMultiple') IS NOT NULL
    ALTER TABLE dbo.FieldDefinition DROP COLUMN AllowMultiple;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'TargetObjectType') IS NOT NULL
    ALTER TABLE dbo.FieldDefinition DROP COLUMN TargetObjectType;
GO

IF COL_LENGTH(N'dbo.FieldDefinition', N'IsSystemProvisioned') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_FieldDefinition_IsSystemProvisioned'
    )
        ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT DF_FieldDefinition_IsSystemProvisioned;

    ALTER TABLE dbo.FieldDefinition DROP COLUMN IsSystemProvisioned;
END;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_056_AlterFieldDefinition_AddLinkToRecordConfig')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_056_AlterFieldDefinition_AddLinkToRecordConfig';
GO
