-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Creates dbo.FieldDefinition — the per-workspace field schema unit
--              (BS §2.3, §3, §17). One row per (WorkspaceId, ObjectType, FieldKey).
--              Category maps the §17 crossing tags: 'Crossing' [S], 'AiSide' [A],
--              'Platform' [P], 'WorkspaceLocal' ●. Platform-defined fields are
--              referenced here (IsPlatformDefined = 1 + PlatformFieldKey) carrying
--              local presentation; the central definition (S34) wins at read time.
--              VisibleStagesJson is a JSON array of stage keys; NULL = all stages
--              (§3.2). IsRetired is configuration retirement (BS §4.3) — distinct from
--              soft delete. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.FieldDefinition', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FieldDefinition
    (
        FieldDefinitionId    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_FieldDefinition_FieldDefinitionId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId          UNIQUEIDENTIFIER NOT NULL,
        -- 'Request' | 'Task' | 'Feature' — the object the field belongs to (§2.4/§2.5).
        ObjectType           NVARCHAR(16)     NOT NULL,
        -- Stable machine key, unique per (workspace, object type).
        FieldKey             NVARCHAR(64)     NOT NULL,
        DisplayName          NVARCHAR(200)    NOT NULL,
        -- One of the fixed field-type catalog values (§2.3).
        FieldType            NVARCHAR(32)     NOT NULL,
        -- 'Crossing' [S] | 'AiSide' [A] | 'Platform' [P] | 'WorkspaceLocal' ● (§17 tags).
        Category             NVARCHAR(16)     NOT NULL,
        -- Intake grouping (Intake / Value mapping / Solution details / …); presentation only.
        Section              NVARCHAR(64)     NULL,
        HelpText             NVARCHAR(400)    NULL,
        IsRequired           BIT              NOT NULL CONSTRAINT DF_FieldDefinition_IsRequired DEFAULT 0,
        -- Derived and platform-band fields are read-only in the workspace schema.
        IsReadOnly           BIT              NOT NULL CONSTRAINT DF_FieldDefinition_IsReadOnly DEFAULT 0,
        -- Reference to a platform-defined field (§4.3) — renders in the read-only band.
        IsPlatformDefined    BIT              NOT NULL CONSTRAINT DF_FieldDefinition_IsPlatformDefined DEFAULT 0,
        PlatformFieldKey     NVARCHAR(64)     NULL,
        -- JSON array of stage keys the field is visible on; NULL = all stages (§3.2).
        VisibleStagesJson    NVARCHAR(MAX)    NULL,
        -- Same-named AI-side target key for a Crossing ([S]) field's 1:1 seed map (§6.2).
        CrossingToFieldKey   NVARCHAR(64)     NULL,
        -- Numeric validation bounds (e.g. Business Value 1–5).
        MinValue             DECIMAL(18, 4)   NULL,
        MaxValue             DECIMAL(18, 4)   NULL,
        -- Multi-select allow-new-values toggle (§2.3).
        AllowNewValues       BIT              NOT NULL CONSTRAINT DF_FieldDefinition_AllowNewValues DEFAULT 0,
        SortOrder            INT              NOT NULL CONSTRAINT DF_FieldDefinition_SortOrder DEFAULT 0,
        -- Configuration retirement (BS §4.3) — history preserved, distinct from soft delete.
        IsRetired            BIT              NOT NULL CONSTRAINT DF_FieldDefinition_IsRetired DEFAULT 0,
        RetiredAt            DATETIME2        NULL,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_FieldDefinition_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_FieldDefinition_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_FieldDefinition_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_FieldDefinition PRIMARY KEY CLUSTERED (FieldDefinitionId),
        CONSTRAINT FK_FieldDefinition_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_FieldDefinition_ObjectType CHECK (ObjectType IN (N'Request', N'Task', N'Feature')),
        CONSTRAINT CK_FieldDefinition_Category CHECK (Category IN (N'Crossing', N'AiSide', N'Platform', N'WorkspaceLocal')),
        CONSTRAINT CK_FieldDefinition_FieldType CHECK (FieldType IN (
            N'ShortText', N'LongText', N'RichText', N'Number', N'Decimal', N'Currency', N'Percent',
            N'Date', N'DateTime', N'SingleSelect', N'MultiSelect', N'Boolean', N'UserReference',
            N'RecordReference', N'Url', N'Calculation', N'DerivedCategory'))
    );
END;
GO

-- FK index (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE NONCLUSTERED INDEX IX_FieldDefinition_WorkspaceId ON dbo.FieldDefinition (WorkspaceId);
GO

-- The list read is always workspace + object-type scoped, ordered by SortOrder.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldDefinition_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE NONCLUSTERED INDEX IX_FieldDefinition_Workspace_Object
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, SortOrder)
        INCLUDE (FieldKey, DisplayName, FieldType, Category, IsRetired) WHERE IsDeleted = 0;
GO

-- One active field key per (workspace, object type).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE UNIQUE INDEX UX_FieldDefinition_Workspace_Object_Key
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_014_CreateFieldDefinition')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_014_CreateFieldDefinition', SUSER_SNAME(), N'Slice 3 — FieldDefinition table.');
END;
GO
