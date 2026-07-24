-- =============================================
-- Author:      /dev-build-application (SP2 Slice A — Custom-object records: browse/CRUD UI)
-- Create Date: 2026-07-24
-- Description: Generalizes dbo.SavedView.ObjectType to accept custom-object slugs so per-object saved
--              views work for custom objects. The saved-views subsystem is already generic over
--              ObjectType; the only blockers were the closed-enum CHECK and the narrow column:
--                1. Drop CK_SavedView_ObjectType (was Request|Feature|Task|Announcement) — object-type
--                   validity is enforced in the app against dbo.ObjectDefinition, mirroring SP1's drop
--                   of CK_FieldDefinition_ObjectType.
--                2. Widen ObjectType NVARCHAR(16) -> NVARCHAR(64) so a per-object slug fits.
--              IX_SavedView_Surface keys on ObjectType, so it is dropped before the ALTER and recreated
--              after. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Drop the closed-enum CHECK so custom-object slugs are permitted (validity app-enforced).
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = N'CK_SavedView_ObjectType' AND parent_object_id = OBJECT_ID(N'dbo.SavedView'))
    ALTER TABLE dbo.SavedView DROP CONSTRAINT CK_SavedView_ObjectType;
GO

-- 2. The surface index keys on ObjectType — drop it before widening the column.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SavedView_Surface' AND object_id = OBJECT_ID(N'dbo.SavedView'))
    DROP INDEX IX_SavedView_Surface ON dbo.SavedView;
GO

-- 3. Widen ObjectType 16 -> 64 (NVARCHAR(16) = 32 bytes; NVARCHAR(64) = 128 bytes).
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'dbo.SavedView') AND name = N'ObjectType' AND max_length = 32)
    ALTER TABLE dbo.SavedView ALTER COLUMN ObjectType NVARCHAR(64) NOT NULL;
GO

-- 4. Recreate the surface index (unchanged definition).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SavedView_Surface' AND object_id = OBJECT_ID(N'dbo.SavedView'))
    CREATE NONCLUSTERED INDEX IX_SavedView_Surface
        ON dbo.SavedView (WorkspaceId, ObjectType, IsDeleted)
        INCLUDE (Scope, OwnerUserId, Name, IsDefault);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_086_WidenSavedViewObjectType')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260724_086_WidenSavedViewObjectType', SUSER_SNAME(),
            N'Widen SavedView.ObjectType 16->64 and drop CK_SavedView_ObjectType so per-object saved views accept custom-object slugs (validity app-enforced).');
END;
GO
