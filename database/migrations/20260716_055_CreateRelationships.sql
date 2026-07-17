-- =============================================
-- Author:      /dev-build-application (Slice 25 — Object-level Relationships, S30 Relationships tab, S4/S5 config-driven tab bar)
-- Create Date: 2026-07-16
-- Description: Creates dbo.Relationships — the workspace-owned object-level Relationship
--              definitions (v2-reconciliation.md §Model deltas 1, module-boundaries §27,
--              api-contracts §Relationships). A Relationship pairs two objects
--              (FromObjectType → ToObjectType) with a cardinality and side labels; the
--              Fields & Objects schema engine (Slice 3) is extended by Slice 25 to
--              auto-provision the paired Link-to-record FieldDefinition rows in the same
--              transaction as usp_UpsertRelationship on non-system rows.
--
--              IsSystem BIT is the marker that a Relationship models a pre-existing
--              table-backed link (Request → Task, Request → Attachment) rather than an
--              admin-authored Relationship. System rows are seeded by migration
--              20260716_058_SeedBuiltInRelationships and:
--                (a) skip Link-to-record FieldDefinition auto-provisioning at upsert,
--                (b) cannot be retired or edited from the S30 admin surface,
--                (c) drive the config-driven tab bar on S4/S5 alongside admin-authored
--                    ShowOnFromAsTab=1 relationships.
--
--              Unique-filtered index on (WorkspaceId, FromObjectType, ToObjectType, Name)
--              WHERE IsDeleted = 0 keeps names distinct per direction pair; retired rows
--              soft-delete so historical links persist.
--
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Relationships', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Relationships
    (
        RelationshipId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Relationships_RelationshipId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId          UNIQUEIDENTIFIER NOT NULL,
        -- Human-readable relationship name, e.g. "Request has Tasks". Unique per (workspace, from, to).
        Name                 NVARCHAR(120)    NOT NULL,
        -- FromObjectType → ToObjectType. ToolkitItem is included so Slice 29 registers cleanly.
        FromObjectType       NVARCHAR(50)     NOT NULL,
        ToObjectType         NVARCHAR(50)     NOT NULL,
        -- 'OneToOne' | 'OneToMany' | 'ManyToMany'. Immutable after create — changing cardinality
        -- would require rebuilding the auto-provisioned FieldDefinition rows and orphan link rows.
        Cardinality          NVARCHAR(20)     NOT NULL,
        -- Rendered on each side's detail. e.g. "Tasks" (From) / "Request" (To).
        FromSideLabel        NVARCHAR(80)     NOT NULL,
        ToSideLabel          NVARCHAR(80)     NOT NULL,
        -- When 1, the From-side detail renders this relationship as a config-driven tab
        -- (see useRelationshipTabs hook / GenericRelatedRecordsTab component in web/).
        ShowOnFromAsTab      BIT              NOT NULL CONSTRAINT DF_Relationships_ShowOnFromAsTab DEFAULT 0,
        TabLabel             NVARCHAR(80)     NULL,
        SortOrder            INT              NOT NULL CONSTRAINT DF_Relationships_SortOrder DEFAULT 0,
        -- Configuration retirement (BS §4.3) — history-preserving. Distinct from soft delete.
        IsRetired            BIT              NOT NULL CONSTRAINT DF_Relationships_IsRetired DEFAULT 0,
        RetiredAt            DATETIME2        NULL,
        -- System-seeded (Request→Task, Request→Attachment) — skips Link-to-record field
        -- auto-provisioning, cannot be retired/edited from the admin surface.
        IsSystem             BIT              NOT NULL CONSTRAINT DF_Relationships_IsSystem DEFAULT 0,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_Relationships_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_Relationships_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_Relationships_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_Relationships PRIMARY KEY CLUSTERED (RelationshipId),
        CONSTRAINT FK_Relationships_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Relationships_FromObjectType CHECK (FromObjectType IN (N'Request', N'Task', N'Feature', N'ToolkitItem')),
        CONSTRAINT CK_Relationships_ToObjectType CHECK (ToObjectType IN (N'Request', N'Task', N'Feature', N'ToolkitItem')),
        CONSTRAINT CK_Relationships_Cardinality CHECK (Cardinality IN (N'OneToOne', N'OneToMany', N'ManyToMany')),
        -- ShowOnFromAsTab requires a tab label; the reverse is not required.
        CONSTRAINT CK_Relationships_TabLabel CHECK (ShowOnFromAsTab = 0 OR TabLabel IS NOT NULL)
    );
END;
GO

-- FK index (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Relationships_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Relationships'))
    CREATE NONCLUSTERED INDEX IX_Relationships_WorkspaceId ON dbo.Relationships (WorkspaceId);
GO

-- Workspace-scoped list read (S30 Relationships tab).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Relationships_Workspace_List' AND object_id = OBJECT_ID(N'dbo.Relationships'))
    CREATE NONCLUSTERED INDEX IX_Relationships_Workspace_List
        ON dbo.Relationships (WorkspaceId, FromObjectType, SortOrder)
        INCLUDE (Name, ToObjectType, Cardinality, ShowOnFromAsTab, TabLabel, IsRetired, IsSystem)
        WHERE IsDeleted = 0;
GO

-- One active relationship name per (workspace, from, to). Retired rows still occupy the name
-- until soft-deleted; that's intentional — a retired name shouldn't collide with a new one.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Relationships_Workspace_FromTo_Name' AND object_id = OBJECT_ID(N'dbo.Relationships'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_Relationships_Workspace_FromTo_Name
        ON dbo.Relationships (WorkspaceId, FromObjectType, ToObjectType, Name)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_055_CreateRelationships')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260716_055_CreateRelationships', SUSER_SNAME(), N'Slice 25 — Relationships table (workspace-owned object-level relationship definitions).');
END;
GO
