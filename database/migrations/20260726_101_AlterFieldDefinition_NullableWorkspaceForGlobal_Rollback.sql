-- =============================================
-- Author:      global-custom-objects (SP3b slice 2a)
-- Create Date: 2026-07-26
-- Description: Rollback for 20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal.
--              Drops the re-scoped per-workspace unique index and two legacy non-unique indexes,
--              then restores WorkspaceId to NOT NULL. The NOT NULL restore is only safe if no
--              Global (WorkspaceId IS NULL) rows exist — if any do, the rollback stops with a
--              clear error rather than silently orphaning or corrupting data.
--
--              Note: unlike the forward migration's NOT NULL -> NULL change (a metadata-only
--              operation SQL Server allows even with indexes present), this NULL -> NOT NULL
--              narrowing requires SQL Server to validate the column, which it refuses to do
--              while any index still references WorkspaceId. Two legacy non-unique indexes from
--              migration 014 (IX_FieldDefinition_WorkspaceId, IX_FieldDefinition_Workspace_Object)
--              must be dropped before the ALTER COLUMN and recreated at their ORIGINAL definitions
--              afterward. The re-scoped unique index is also dropped and recreated at its original
--              definition (from migration 078: WHERE IsDeleted = 0, no WorkspaceId IS NOT NULL
--              clause). Mirrors the pattern in 20260726_100_AlterObjectDefinition_NullableWorkspaceForGlobal_Rollback.sql.
--              Idempotent.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Refuse to restore NOT NULL while Global (WorkspaceId IS NULL) rows exist — restoring the
--    constraint would otherwise fail with a generic SQL Server error; this gives a clear one.
--    Checked first, before anything is dropped, so a blocked rollback leaves the schema untouched.
IF EXISTS (SELECT 1 FROM dbo.FieldDefinition WHERE WorkspaceId IS NULL)
BEGIN
    THROW 51000, N'Rollback aborted: dbo.FieldDefinition has Global rows with WorkspaceId IS NULL. Remove or re-home these rows to a workspace before rolling back this migration.', 1;
END;
GO

-- 2. Drop the re-scoped per-workspace unique index.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX UX_FieldDefinition_Workspace_Object_Key ON dbo.FieldDefinition;
GO

-- 3. Drop all non-unique indexes on WorkspaceId — SQL Server blocks a NULL -> NOT NULL ALTER COLUMN
--    while any index still references the column. Affected indexes: migration 014 legacy indexes
--    (IX_FieldDefinition_WorkspaceId, IX_FieldDefinition_Workspace_Object) and migration 056 filtered
--    index (IX_FieldDefinition_SystemProvisioned).
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX IX_FieldDefinition_WorkspaceId ON dbo.FieldDefinition;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX IX_FieldDefinition_Workspace_Object ON dbo.FieldDefinition;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_SystemProvisioned' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX IX_FieldDefinition_SystemProvisioned ON dbo.FieldDefinition;
GO

-- 4. Restore WorkspaceId to NOT NULL (only runs if step 1 did not throw).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.FieldDefinition')
           AND name = N'WorkspaceId' AND is_nullable = 1)
    ALTER TABLE dbo.FieldDefinition ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NOT NULL;
GO

-- 5. Recreate the per-workspace unique index at its original definition (from migration 078:
--    WHERE IsDeleted = 0, no WorkspaceId IS NOT NULL clause).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE UNIQUE INDEX UX_FieldDefinition_Workspace_Object_Key
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey) WHERE IsDeleted = 0;
GO

-- 6. Recreate all non-unique indexes at their original definitions (migration 014 + 056).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE NONCLUSTERED INDEX IX_FieldDefinition_WorkspaceId ON dbo.FieldDefinition (WorkspaceId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE NONCLUSTERED INDEX IX_FieldDefinition_Workspace_Object
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, SortOrder)
        INCLUDE (FieldKey, DisplayName, FieldType, Category, IsRetired) WHERE IsDeleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_SystemProvisioned' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE NONCLUSTERED INDEX IX_FieldDefinition_SystemProvisioned
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, SortOrder)
        INCLUDE (FieldKey, DisplayName, FieldType, Category)
        WHERE IsSystemProvisioned = 1 AND IsDeleted = 0;
GO

-- 7. Delete the migration history row.
IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal';
GO

