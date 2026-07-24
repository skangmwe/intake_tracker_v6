-- =============================================
-- Author:      /dev-build-application (Slice 1a — Custom-object records: storage & schema)
-- Create Date: 2026-07-24
-- Description: Lets dbo.FieldDefinition hold fields for CUSTOM objects. Two changes:
--
--                1. Widen ObjectType NVARCHAR(16) -> NVARCHAR(64) so it can hold a custom object's
--                   slug (ObjectKey, up to 64 chars). ObjectType participates in three indexes
--                   (IX_FieldDefinition_Workspace_Object, UX_FieldDefinition_Workspace_Object_Key,
--                   UX_FieldDefinition_Global_Object_Key), which must be dropped before the
--                   ALTER COLUMN and recreated after.
--                2. Drop CK_FieldDefinition_ObjectType. Object-type validity is now enforced in the
--                   application against dbo.ObjectDefinition, not a hard-coded list — a custom
--                   object's field rows carry ObjectType = <slug>, which no fixed CHECK can allow.
--
--              The DROP + ALTER runs only while the column is still 16 wide; index recreation and
--              the CHECK drop are separate guarded steps, so a partially-applied migration
--              self-heals on re-run. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Widen ObjectType — only while it is still the narrow 16-wide column (max_length 32 bytes).
--    Drop the three indexes that reference ObjectType first (recreated below).
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.FieldDefinition')
      AND name = N'ObjectType'
      AND max_length = 32)
BEGIN
    DROP INDEX IF EXISTS IX_FieldDefinition_Workspace_Object     ON dbo.FieldDefinition;
    DROP INDEX IF EXISTS UX_FieldDefinition_Workspace_Object_Key ON dbo.FieldDefinition;
    DROP INDEX IF EXISTS UX_FieldDefinition_Global_Object_Key    ON dbo.FieldDefinition;

    ALTER TABLE dbo.FieldDefinition ALTER COLUMN ObjectType NVARCHAR(64) NOT NULL;
END;
GO

-- 2. Recreate the three indexes with their original definitions (idempotent, self-healing).
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

-- 3. Drop the object-type CHECK — validity is enforced in the app against dbo.ObjectDefinition.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    ALTER TABLE dbo.FieldDefinition DROP CONSTRAINT CK_FieldDefinition_ObjectType;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_078_AllowCustomObjectFields')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260724_078_AllowCustomObjectFields', SUSER_SNAME(),
            N'Custom-object records — widen FieldDefinition.ObjectType to NVARCHAR(64) and drop the ObjectType CHECK.');
END;
GO
