-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab, S30 Fields & objects → Objects)
-- Create Date: 2026-07-20
-- Description: Creates dbo.ObjectDefinition — the workspace-owned CUSTOM object-type
--              definitions surfaced on the S30 Fields & objects → Objects tab. Each row is
--              a user-created object registry entry: display name, plural label, location
--              (Global | LocalWorkspace), description, and left-sidebar navigation config.
--
--              The five BUILT-IN objects (Request, Task, Attachment, Feature, Toolkit item)
--              are NOT stored here — they are constants composed in ObjectSchemaService with
--              live Records/Fields counts. This table holds only admin-created custom objects,
--              so IsSystem is not modelled (every row is a custom object). Records/Fields
--              counts are derived (0 for a freshly-registered custom object) and are never
--              stored on the row.
--
--              Unique-filtered index on (WorkspaceId, Name) WHERE IsDeleted = 0 keeps object
--              names distinct per workspace; delete is soft so history persists.
--
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ObjectDefinition', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ObjectDefinition
    (
        ObjectDefinitionId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ObjectDefinition_ObjectDefinitionId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId          UNIQUEIDENTIFIER NOT NULL,
        -- Singular display name, e.g. "Vendor". Unique per workspace (active rows).
        Name                 NVARCHAR(120)    NOT NULL,
        -- Plural label used in list headings, e.g. "Vendors". Optional.
        PluralLabel          NVARCHAR(120)    NULL,
        -- 'Global' (shared across workspaces) | 'LocalWorkspace' (this workspace only).
        Location             NVARCHAR(20)     NOT NULL CONSTRAINT DF_ObjectDefinition_Location DEFAULT N'LocalWorkspace',
        Description          NVARCHAR(500)    NULL,
        -- Whether the object gets a left-sidebar navigation item, and under which category.
        ShowInSidebar        BIT              NOT NULL CONSTRAINT DF_ObjectDefinition_ShowInSidebar DEFAULT 0,
        SidebarCategory      NVARCHAR(80)     NULL,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_ObjectDefinition_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_ObjectDefinition_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_ObjectDefinition_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_ObjectDefinition PRIMARY KEY CLUSTERED (ObjectDefinitionId),
        CONSTRAINT FK_ObjectDefinition_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_ObjectDefinition_Location CHECK (Location IN (N'Global', N'LocalWorkspace'))
    );
END;
GO

-- FK index (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ObjectDefinition_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE NONCLUSTERED INDEX IX_ObjectDefinition_WorkspaceId ON dbo.ObjectDefinition (WorkspaceId);
GO

-- Workspace-scoped list read (S30 Objects tab), covering the list columns.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ObjectDefinition_Workspace_List' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE NONCLUSTERED INDEX IX_ObjectDefinition_Workspace_List
        ON dbo.ObjectDefinition (WorkspaceId, Name)
        INCLUDE (PluralLabel, Location, Description, ShowInSidebar, SidebarCategory)
        WHERE IsDeleted = 0;
GO

-- One active object name per workspace. Soft-deleted rows free the name.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Workspace_Name
        ON dbo.ObjectDefinition (WorkspaceId, Name)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_071_CreateObjectDefinition')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260720_071_CreateObjectDefinition', SUSER_SNAME(), N'Objects tab — ObjectDefinition table (workspace-owned custom object definitions).');
END;
GO
