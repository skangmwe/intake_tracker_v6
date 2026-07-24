-- =============================================
-- Author:      /dev-build-application (SP2 Slice A — Custom-object records: browse/CRUD UI)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_086_WidenSavedViewObjectType — restores ObjectType NVARCHAR(16)
--              and re-adds CK_SavedView_ObjectType. Best-effort: narrowing fails if any row already
--              holds a slug longer than 16 chars or a value outside the original enum; revert before
--              such rows exist. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Drop the surface index before narrowing the column.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SavedView_Surface' AND object_id = OBJECT_ID(N'dbo.SavedView'))
    DROP INDEX IX_SavedView_Surface ON dbo.SavedView;
GO

-- 2. Narrow ObjectType 64 -> 16 (NVARCHAR(64) = 128 bytes; NVARCHAR(16) = 32 bytes).
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'dbo.SavedView') AND name = N'ObjectType' AND max_length = 128)
    ALTER TABLE dbo.SavedView ALTER COLUMN ObjectType NVARCHAR(16) NOT NULL;
GO

-- 3. Recreate the surface index.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SavedView_Surface' AND object_id = OBJECT_ID(N'dbo.SavedView'))
    CREATE NONCLUSTERED INDEX IX_SavedView_Surface
        ON dbo.SavedView (WorkspaceId, ObjectType, IsDeleted)
        INCLUDE (Scope, OwnerUserId, Name, IsDefault);
GO

-- 4. Restore the closed-enum CHECK.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_SavedView_ObjectType' AND parent_object_id = OBJECT_ID(N'dbo.SavedView'))
    ALTER TABLE dbo.SavedView ADD CONSTRAINT CK_SavedView_ObjectType CHECK
        (ObjectType IN (N'Request', N'Feature', N'Task', N'Announcement'));
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_086_WidenSavedViewObjectType';
GO
