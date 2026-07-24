-- =============================================
-- Author:      /dev-build-application (Slice 1a — Custom-object records: storage & schema)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_078_AllowCustomObjectFields. Restores the ObjectType CHECK and
--              narrows the column back to NVARCHAR(16) — but ONLY when the data still fits the
--              original built-in-only model. If any custom-object field rows exist (ObjectType not
--              in the built-in set, or a slug longer than 16 chars), those steps are skipped and
--              left as-is (narrowing/re-checking would fail or silently drop data). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Re-add the object-type CHECK only if no row would violate it (i.e. no custom-object fields).
IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_FieldDefinition_ObjectType'
          AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition'))
   AND NOT EXISTS (
        SELECT 1 FROM dbo.FieldDefinition
        WHERE ObjectType NOT IN (N'Request', N'Task', N'Feature', N'ToolkitItem', N'Attachment'))
    ALTER TABLE dbo.FieldDefinition
        ADD CONSTRAINT CK_FieldDefinition_ObjectType
        CHECK (ObjectType IN (N'Request', N'Task', N'Feature', N'ToolkitItem', N'Attachment'));
GO

-- 2. Narrow ObjectType back to NVARCHAR(16) only while it is currently 64 wide (max_length 128) AND
--    every value fits in 16 chars. Drop the three ObjectType indexes first (recreated below).
IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.FieldDefinition')
          AND name = N'ObjectType'
          AND max_length = 128)
   AND NOT EXISTS (SELECT 1 FROM dbo.FieldDefinition WHERE LEN(ObjectType) > 16)
BEGIN
    DROP INDEX IF EXISTS IX_FieldDefinition_Workspace_Object     ON dbo.FieldDefinition;
    DROP INDEX IF EXISTS UX_FieldDefinition_Workspace_Object_Key ON dbo.FieldDefinition;
    DROP INDEX IF EXISTS UX_FieldDefinition_Global_Object_Key    ON dbo.FieldDefinition;

    ALTER TABLE dbo.FieldDefinition ALTER COLUMN ObjectType NVARCHAR(16) NOT NULL;
END;
GO

-- 3. Recreate the three indexes if missing (self-healing whether or not step 2 ran).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE NONCLUSTERED INDEX IX_FieldDefinition_Workspace_Object
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, SortOrder)
        INCLUDE (FieldKey, DisplayName, FieldType, Category, IsRetired) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE UNIQUE INDEX UX_FieldDefinition_Workspace_Object_Key
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Global_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_FieldDefinition_Global_Object_Key
        ON dbo.FieldDefinition (ObjectType, FieldKey)
        WHERE Location = N'Global' AND IsDeleted = 0;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_078_AllowCustomObjectFields';
GO
