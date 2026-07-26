-- =============================================
-- Author:      global-custom-objects (SP3b slice 2a — Task 2 fix pass)
-- Create Date: 2026-07-26
-- Description: Rollback for 20260726_102_AlterFieldRuleDependency_NullableWorkspaceForGlobal.
--              Drops the two indexes that reference WorkspaceId, restores WorkspaceId to NOT
--              NULL, then recreates both indexes at their original definitions. The NOT NULL
--              restore is only safe if no Global (WorkspaceId IS NULL) rows exist — if any do,
--              the rollback stops with a clear error rather than silently orphaning or
--              corrupting data. Mirrors 20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal_Rollback.sql.
--              Idempotent.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Refuse to restore NOT NULL while Global (WorkspaceId IS NULL) rows exist — checked first,
--    before anything is dropped, so a blocked rollback leaves the schema untouched.
IF EXISTS (SELECT 1 FROM dbo.FieldRuleDependency WHERE WorkspaceId IS NULL)
BEGIN
    THROW 51001, N'Rollback aborted: dbo.FieldRuleDependency has Global rows with WorkspaceId IS NULL. Remove or re-home these rows to a workspace before rolling back this migration.', 1;
END;
GO

-- 2. Drop both indexes that reference WorkspaceId — SQL Server blocks a NULL -> NOT NULL ALTER
--    COLUMN while any index still references the column.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    DROP INDEX IX_FieldRuleDependency_WorkspaceId ON dbo.FieldRuleDependency;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    DROP INDEX IX_FieldRuleDependency_Workspace_Object ON dbo.FieldRuleDependency;
GO

-- 3. Restore WorkspaceId to NOT NULL (only runs if step 1 did not throw).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.FieldRuleDependency')
           AND name = N'WorkspaceId' AND is_nullable = 1)
    ALTER TABLE dbo.FieldRuleDependency ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NOT NULL;
GO

-- 4. Recreate both indexes at their original definitions (migration 014 + migration 094's recreate).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    CREATE NONCLUSTERED INDEX IX_FieldRuleDependency_WorkspaceId ON dbo.FieldRuleDependency (WorkspaceId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    CREATE NONCLUSTERED INDEX IX_FieldRuleDependency_Workspace_Object
        ON dbo.FieldRuleDependency (WorkspaceId, ObjectType)
        INCLUDE (FromFieldKey, ToFieldKey) WHERE IsDeleted = 0;
GO

-- 5. Delete the migration history row.
IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_102_AlterFieldRuleDependency_NullableWorkspaceForGlobal')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_102_AlterFieldRuleDependency_NullableWorkspaceForGlobal';
GO
