-- =============================================
-- Author:      global-custom-objects (SP3b slice 1)
-- Create Date: 2026-07-26
-- Description: Rollback for 20260726_100_AlterObjectDefinition_NullableWorkspaceForGlobal.
--              Drops the two firm-wide Global unique indexes, drops and recreates the two
--              per-workspace unique indexes at their ORIGINAL definition (WHERE IsDeleted = 0,
--              no WorkspaceId IS NOT NULL clause — see migrations 071 and 077), then restores
--              WorkspaceId to NOT NULL. The NOT NULL restore is only safe if no Global
--              (WorkspaceId IS NULL) rows exist — if any do, the rollback stops with a clear
--              error rather than silently orphaning or corrupting data.
--
--              Note: unlike the forward migration's NOT NULL -> NULL change (a metadata-only
--              operation SQL Server allows even with indexes present), this NULL -> NOT NULL
--              narrowing requires SQL Server to validate/rebuild the column, which it refuses
--              to do while ANY index — not just the unique ones re-scoped above — still
--              references WorkspaceId. dbo.ObjectDefinition also carries two long-standing,
--              non-unique indexes from migration 071 (IX_ObjectDefinition_WorkspaceId,
--              IX_ObjectDefinition_Workspace_List) that key on WorkspaceId; those must also be
--              dropped before the ALTER COLUMN and recreated at their original (unchanged)
--              definition afterward. Idempotent.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Refuse to restore NOT NULL while Global (WorkspaceId IS NULL) rows exist — restoring the
--    constraint would otherwise fail with a generic SQL Server error; this gives a clear one.
--    Checked first, before anything is dropped, so a blocked rollback leaves the schema untouched.
IF EXISTS (SELECT 1 FROM dbo.ObjectDefinition WHERE WorkspaceId IS NULL)
BEGIN
    THROW 51000, N'Rollback aborted: dbo.ObjectDefinition has Global rows with WorkspaceId IS NULL. Remove or re-home these rows to a workspace before rolling back this migration.', 1;
END;
GO

-- 2. Drop the firm-wide Global unique indexes.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Global_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Global_ObjectKey ON dbo.ObjectDefinition;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Global_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Global_Name ON dbo.ObjectDefinition;
GO

-- 3. Drop the re-scoped per-workspace unique indexes.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Workspace_Name ON dbo.ObjectDefinition;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Workspace_ObjectKey ON dbo.ObjectDefinition;
GO

-- 4. Drop the two pre-existing (migration 071) non-unique indexes on WorkspaceId — SQL Server
--    blocks a NULL -> NOT NULL ALTER COLUMN while any index still references the column.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ObjectDefinition_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX IX_ObjectDefinition_WorkspaceId ON dbo.ObjectDefinition;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ObjectDefinition_Workspace_List' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX IX_ObjectDefinition_Workspace_List ON dbo.ObjectDefinition;
GO

-- 5. Restore WorkspaceId to NOT NULL (only runs if step 1 did not throw).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ObjectDefinition')
           AND name = N'WorkspaceId' AND is_nullable = 1)
    ALTER TABLE dbo.ObjectDefinition ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NOT NULL;
GO

-- 6. Recreate the per-workspace unique indexes at their original definition (pre-slice-1).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Workspace_Name
        ON dbo.ObjectDefinition (WorkspaceId, Name)
        WHERE IsDeleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Workspace_ObjectKey
        ON dbo.ObjectDefinition (WorkspaceId, ObjectKey)
        WHERE IsDeleted = 0;
GO

-- 7. Recreate the two migration-071 non-unique indexes at their original definition.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ObjectDefinition_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE NONCLUSTERED INDEX IX_ObjectDefinition_WorkspaceId ON dbo.ObjectDefinition (WorkspaceId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ObjectDefinition_Workspace_List' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE NONCLUSTERED INDEX IX_ObjectDefinition_Workspace_List
        ON dbo.ObjectDefinition (WorkspaceId, Name)
        INCLUDE (PluralLabel, Location, Description, ShowInSidebar, SidebarCategory)
        WHERE IsDeleted = 0;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_100_AlterObjectDefinition_NullableWorkspaceForGlobal')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_100_AlterObjectDefinition_NullableWorkspaceForGlobal';
GO
