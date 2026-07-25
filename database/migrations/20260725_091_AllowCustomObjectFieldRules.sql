-- =============================================
-- Author:      SP3 — Fields on custom objects
-- Create Date: 2026-07-24
-- Description: Lets dbo.FieldRuleDependency hold rows for CUSTOM-object fields. The field upsert proc
--              inserts one dependency row per condition rule, keyed by (WorkspaceId, ObjectType, …).
--              Two changes mirror migration 078 (which did this for dbo.FieldDefinition):
--                1. Widen ObjectType NVARCHAR(16) -> NVARCHAR(64) so it can hold a custom object's
--                   slug (ObjectKey, up to 64 chars). ObjectType participates in the composite index
--                   IX_FieldRuleDependency_Workspace_Object, dropped before the ALTER and recreated.
--                2. Drop CK_FieldRuleDependency_ObjectType (IN 'Request','Task','Feature') — validity
--                   is enforced in the application against dbo.ObjectDefinition, not a fixed list.
--              Idempotent; self-heals on re-run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Widen ObjectType — only while it is still the narrow 16-wide column (max_length 32 bytes).
--    Drop the composite index that references ObjectType first (recreated below).
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.FieldRuleDependency')
      AND name = N'ObjectType'
      AND max_length = 32)
BEGIN
    DROP INDEX IF EXISTS IX_FieldRuleDependency_Workspace_Object ON dbo.FieldRuleDependency;

    ALTER TABLE dbo.FieldRuleDependency ALTER COLUMN ObjectType NVARCHAR(64) NOT NULL;
END;
GO

-- 2. Recreate the composite index with its original definition (idempotent, self-healing).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    CREATE NONCLUSTERED INDEX IX_FieldRuleDependency_Workspace_Object
        ON dbo.FieldRuleDependency (WorkspaceId, ObjectType)
        INCLUDE (FromFieldKey, ToFieldKey) WHERE IsDeleted = 0;
GO

-- 3. Drop the object-type CHECK — validity is enforced in the app against dbo.ObjectDefinition.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldRuleDependency_ObjectType'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    ALTER TABLE dbo.FieldRuleDependency DROP CONSTRAINT CK_FieldRuleDependency_ObjectType;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_091_AllowCustomObjectFieldRules')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260725_091_AllowCustomObjectFieldRules', SUSER_SNAME(),
            N'Custom-object field rules — widen FieldRuleDependency.ObjectType to NVARCHAR(64) and drop the ObjectType CHECK.');
END;
GO
