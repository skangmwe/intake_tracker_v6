-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Creates dbo.SavedView — a named column/filter/sort definition over a list surface
--              (BS §22.3-22.4, data-model.md §SavedView, module-boundaries.md §14). Presentation
--              only: a saved view NEVER widens access — it is applied over an already access-
--              filtered query, and rows always resolve to the caller's entitlements.
--
--              ObjectType binds a view to one list surface (Request list S2 vs Feature list S9,
--              etc.) so a Request view never appears on the Features picker. Scope is
--              personal (owner-only) or shared (every workspace member). Columns / Filters / Sort
--              are JSON, matching the shared SavedViewDto shape:
--                Columns : ["name","stage",...]                          (string[])
--                Filters : { "stage": { "kind":"select","values":[...] } } (Record<key,FilterClause>)
--                Sort    : [ { "column":"updatedAt","direction":"desc" } ]  (ordered)
--
--              IsDefault is scoped per (owner, workspace, objectType) — the upsert proc clears the
--              caller's previous default in the same surface when a new default is set.
--              Soft-deleted by default; deleting a view never touches records. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SavedView', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SavedView
    (
        SavedViewId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_SavedView_SavedViewId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId  UNIQUEIDENTIFIER NOT NULL,
        -- Request | Feature | Task | Announcement — the list surface this view binds to.
        ObjectType   NVARCHAR(16)     NOT NULL,
        Name         NVARCHAR(200)    NOT NULL,
        -- personal (owner-only) | shared (visible to every workspace member).
        Scope        NVARCHAR(16)     NOT NULL,
        OwnerUserId  UNIQUEIDENTIFIER NOT NULL,
        IsDefault    BIT              NOT NULL CONSTRAINT DF_SavedView_IsDefault DEFAULT 0,
        ColumnsJson  NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_SavedView_Columns DEFAULT N'[]',
        FiltersJson  NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_SavedView_Filters DEFAULT N'{}',
        SortJson     NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_SavedView_Sort    DEFAULT N'[]',

        CreatedAt    DATETIME2        NOT NULL CONSTRAINT DF_SavedView_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2        NOT NULL CONSTRAINT DF_SavedView_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy    NVARCHAR(256)    NOT NULL,
        UpdatedBy    NVARCHAR(256)    NOT NULL,
        IsDeleted    BIT              NOT NULL CONSTRAINT DF_SavedView_IsDeleted DEFAULT 0,
        DeletedAt    DATETIME2        NULL,

        CONSTRAINT PK_SavedView PRIMARY KEY CLUSTERED (SavedViewId),
        CONSTRAINT FK_SavedView_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_SavedView_Users FOREIGN KEY (OwnerUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_SavedView_ObjectType CHECK
            (ObjectType IN (N'Request', N'Feature', N'Task', N'Announcement')),
        CONSTRAINT CK_SavedView_Scope CHECK (Scope IN (N'personal', N'shared')),
        CONSTRAINT CK_SavedView_Columns_Json CHECK (ISJSON(ColumnsJson) = 1),
        CONSTRAINT CK_SavedView_Filters_Json CHECK (ISJSON(FiltersJson) = 1),
        CONSTRAINT CK_SavedView_Sort_Json    CHECK (ISJSON(SortJson) = 1)
    );
END;
GO

-- The list read path: views visible in a workspace surface, keyed by (workspace, object type),
-- covering the scope/owner predicate that decides personal vs shared visibility.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SavedView_Surface' AND object_id = OBJECT_ID(N'dbo.SavedView'))
    CREATE NONCLUSTERED INDEX IX_SavedView_Surface
        ON dbo.SavedView (WorkspaceId, ObjectType, IsDeleted)
        INCLUDE (Scope, OwnerUserId, Name, IsDefault);
GO

-- FK index on OwnerUserId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SavedView_OwnerUserId' AND object_id = OBJECT_ID(N'dbo.SavedView'))
    CREATE NONCLUSTERED INDEX IX_SavedView_OwnerUserId
        ON dbo.SavedView (OwnerUserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_045_CreateSavedView')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_045_CreateSavedView', SUSER_SNAME(), N'Slice 14 — SavedView table (list column/filter/sort definitions).');
END;
GO
