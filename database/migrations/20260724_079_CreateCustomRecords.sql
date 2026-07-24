-- =============================================
-- Author:      /dev-build-application (Slice 1b — Custom-object records: record CRUD API)
-- Create Date: 2026-07-24
-- Description: Creates dbo.CustomRecords — the single generic record store for every CUSTOM object
--              (rows in dbo.ObjectDefinition). One table, discriminated by ObjectDefinitionId, with
--              content held in a FieldValues JSON map keyed by field key — the same model Requests
--              and Features already use. No per-object DDL, no schema drift.
--
--              RowVer (ROWVERSION) backs the optimistic-concurrency ETag on reads, consistent with
--              the Request/Task records. Name is the record's display label (the "name" system
--              field). FieldValues is ISJSON-checked and defaults to an empty object.
--
--              Indexes: a non-clustered FK index on ObjectDefinitionId, and a composite filtered
--              index (WorkspaceId, ObjectDefinitionId, RecordId) WHERE IsDeleted = 0 that both
--              serves the workspace+object list/query read AND covers the WorkspaceId FK (its
--              leading column), so no separate WorkspaceId index is created (no redundant index).
--
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.CustomRecords', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CustomRecords
    (
        RecordId           UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CustomRecords_RecordId DEFAULT NEWSEQUENTIALID(),
        ObjectDefinitionId UNIQUEIDENTIFIER NOT NULL,
        WorkspaceId        UNIQUEIDENTIFIER NOT NULL,
        -- The record's display label (the "name" system field).
        Name               NVARCHAR(400)    NOT NULL,
        -- Field-key → value JSON map (same model as Requests/Features). Empty object by default.
        FieldValues        NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_CustomRecords_FieldValues DEFAULT N'{}',
        -- Optimistic-concurrency token → base64 ETag on reads.
        RowVer             ROWVERSION       NOT NULL,

        CreatedAt          DATETIME2        NOT NULL CONSTRAINT DF_CustomRecords_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt          DATETIME2        NOT NULL CONSTRAINT DF_CustomRecords_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy          NVARCHAR(256)    NOT NULL,
        UpdatedBy          NVARCHAR(256)    NOT NULL,
        IsDeleted          BIT              NOT NULL CONSTRAINT DF_CustomRecords_IsDeleted DEFAULT 0,
        DeletedAt          DATETIME2        NULL,

        CONSTRAINT PK_CustomRecords PRIMARY KEY CLUSTERED (RecordId),
        CONSTRAINT FK_CustomRecords_ObjectDefinition FOREIGN KEY (ObjectDefinitionId)
            REFERENCES dbo.ObjectDefinition (ObjectDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_CustomRecords_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_CustomRecords_FieldValues CHECK (ISJSON(FieldValues) = 1)
    );
END;
GO

-- FK index for ObjectDefinitionId (the composite below leads with WorkspaceId, so it covers the
-- WorkspaceId FK — no separate WorkspaceId index is created).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CustomRecords_ObjectDefinitionId' AND object_id = OBJECT_ID(N'dbo.CustomRecords'))
    CREATE NONCLUSTERED INDEX IX_CustomRecords_ObjectDefinitionId ON dbo.CustomRecords (ObjectDefinitionId);
GO

-- The workspace+object list/query read (soft-delete-filtered), covering RecordId; leading WorkspaceId
-- doubles as the WorkspaceId FK index.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CustomRecords_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.CustomRecords'))
    CREATE NONCLUSTERED INDEX IX_CustomRecords_Workspace_Object
        ON dbo.CustomRecords (WorkspaceId, ObjectDefinitionId, RecordId)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_079_CreateCustomRecords')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260724_079_CreateCustomRecords', SUSER_SNAME(),
            N'Custom-object records — dbo.CustomRecords generic record store (FieldValues JSON, RowVer ETag).');
END;
GO
