-- =============================================
-- Author:      global-custom-objects (SP3b slice 2a)
-- Create Date: 2026-07-26
-- Description: Rollback for 20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal.
--              Drops the re-scoped per-workspace unique index, then restores WorkspaceId to
--              NOT NULL. The NOT NULL restore is only safe if no Global (WorkspaceId IS NULL)
--              rows exist — if any do, the rollback stops with a clear error rather than
--              silently orphaning or corrupting data.
--
--              Note: unlike the forward migration's NOT NULL -> NULL change (a metadata-only
--              operation SQL Server allows even with indexes present), this NULL -> NOT NULL
--              narrowing requires SQL Server to validate the column, which it refuses to do
--              while the unique index still references WorkspaceId. That index is dropped
--              before the ALTER COLUMN and recreated at its ORIGINAL definition (from migration
--              078: WHERE IsDeleted = 0, no WorkspaceId IS NOT NULL clause). Idempotent.
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

-- 3. Restore WorkspaceId to NOT NULL (only runs if step 1 did not throw).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.FieldDefinition')
           AND name = N'WorkspaceId' AND is_nullable = 1)
    ALTER TABLE dbo.FieldDefinition ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NOT NULL;
GO

-- 4. Recreate the per-workspace unique index at its original definition (from migration 078:
--    WHERE IsDeleted = 0, no WorkspaceId IS NOT NULL clause).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE UNIQUE INDEX UX_FieldDefinition_Workspace_Object_Key
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey) WHERE IsDeleted = 0;
GO

-- 5. Delete the migration history row.
IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal';
GO
