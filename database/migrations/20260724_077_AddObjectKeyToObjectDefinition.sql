-- =============================================
-- Author:      /dev-build-application (Slice 1a — Custom-object records: storage & schema)
-- Create Date: 2026-07-24
-- Description: Adds dbo.ObjectDefinition.ObjectKey — an immutable, per-workspace slug for each
--              custom object (e.g. "vendor"), generated from Name at create time and never
--              changed on rename. The slug is copied into FieldDefinition.ObjectType for the
--              object's fields, so the whole field pipeline treats a custom object as "just
--              another object type" keyed by a readable, GUID-free, rename-stable value.
--
--              Column is added NULLable first so any pre-existing custom objects can be
--              backfilled, then set NOT NULL. The seeded dev DB has NO custom objects (they were
--              introduced in migration 071 and none are seeded), so the backfill typically
--              updates zero rows — it is a safety net. Every backfilled slug ends in the left-8
--              of the row's GUID so the unique filtered index below can never collide, whatever
--              the source names.
--
--              Unique filtered index UX_ObjectDefinition_Workspace_ObjectKey enforces one active
--              slug per workspace; soft-deleted rows free the slug.
--
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Add the column NULLable (so existing rows can be backfilled before NOT NULL).
IF COL_LENGTH(N'dbo.ObjectDefinition', N'ObjectKey') IS NULL
    ALTER TABLE dbo.ObjectDefinition ADD ObjectKey NVARCHAR(64) NULL;
GO

-- 2. Backfill a unique slug for any pre-existing custom objects. Lowercase Name; whitespace and
--    common separators -> '-'; three collapse passes; then append '-' + left-8 of the row's GUID
--    so uniqueness holds regardless of duplicate names. (Typically zero rows — safety backfill.)
UPDATE dbo.ObjectDefinition
   SET ObjectKey =
        LEFT(
            REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(REPLACE(REPLACE(
                LOWER(LTRIM(RTRIM(Name)))
                , N' ',      N'-')
                , NCHAR(9),  N'-')
                , NCHAR(10), N'-')
                , NCHAR(13), N'-')
                , N'_',      N'-')
                , N'/',      N'-')
                , N'&',      N'-')
                , N'--',     N'-')   -- collapse pass 1
                , N'--',     N'-')   -- collapse pass 2
                , N'--',     N'-')   -- collapse pass 3
        , 55) + N'-' + LOWER(LEFT(CONVERT(NVARCHAR(36), ObjectDefinitionId), 8))
 WHERE ObjectKey IS NULL;
GO

-- 3. Now that every row carries a slug, set the column NOT NULL.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.ObjectDefinition')
      AND name = N'ObjectKey'
      AND is_nullable = 1)
    ALTER TABLE dbo.ObjectDefinition ALTER COLUMN ObjectKey NVARCHAR(64) NOT NULL;
GO

-- 4. One active slug per workspace. Soft-deleted rows free the slug.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Workspace_ObjectKey
        ON dbo.ObjectDefinition (WorkspaceId, ObjectKey)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_077_AddObjectKeyToObjectDefinition')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260724_077_AddObjectKeyToObjectDefinition', SUSER_SNAME(),
            N'Custom-object records — ObjectDefinition.ObjectKey immutable per-workspace slug + unique index.');
END;
GO
