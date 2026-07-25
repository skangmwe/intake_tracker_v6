-- =============================================
-- Author:      SP3 — Fields on custom objects
-- Create Date: 2026-07-24
-- Description: Rollback for 20260725_094_AllowCustomObjectFieldRules. Restores the ObjectType CHECK
--              and narrows the column back to NVARCHAR(16) — but ONLY when the data still fits the
--              original built-in-only model. If any custom-object rule rows exist (ObjectType not in
--              the built-in set, or a slug longer than 16 chars), those steps are skipped and left
--              as-is (narrowing/re-checking would fail or silently drop data). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Re-add the object-type CHECK only if no row would violate it (i.e. no custom-object rules).
IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_FieldRuleDependency_ObjectType'
          AND parent_object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
   AND NOT EXISTS (
        SELECT 1 FROM dbo.FieldRuleDependency
        WHERE ObjectType NOT IN (N'Request', N'Task', N'Feature'))
    ALTER TABLE dbo.FieldRuleDependency
        ADD CONSTRAINT CK_FieldRuleDependency_ObjectType
        CHECK (ObjectType IN (N'Request', N'Task', N'Feature'));
GO

-- 2. Narrow ObjectType back to NVARCHAR(16) only while it is currently 64 wide (max_length 128) AND
--    every value fits in 16 chars. Drop the composite index first (recreated below).
IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.FieldRuleDependency')
          AND name = N'ObjectType'
          AND max_length = 128)
   AND NOT EXISTS (SELECT 1 FROM dbo.FieldRuleDependency WHERE LEN(ObjectType) > 16)
BEGIN
    DROP INDEX IF EXISTS IX_FieldRuleDependency_Workspace_Object ON dbo.FieldRuleDependency;

    ALTER TABLE dbo.FieldRuleDependency ALTER COLUMN ObjectType NVARCHAR(16) NOT NULL;
END;
GO

-- 3. Recreate the composite index if missing (self-healing whether or not step 2 ran).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    CREATE NONCLUSTERED INDEX IX_FieldRuleDependency_Workspace_Object
        ON dbo.FieldRuleDependency (WorkspaceId, ObjectType)
        INCLUDE (FromFieldKey, ToFieldKey) WHERE IsDeleted = 0;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_094_AllowCustomObjectFieldRules';
GO
