-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Creates dbo.FieldRuleDependency — the materialized edges of a
--              workspace's field-rule dependency graph (BS §3.1). One row per
--              (FromFieldKey depends on ToFieldKey) within a (WorkspaceId, ObjectType).
--              The graph is validated acyclic and depth <= 3 at save; these rows
--              persist the edges for inspection and let the DB re-check. Rewritten
--              wholesale by usp_UpsertFieldDefinition on every field save. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.FieldRuleDependency', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.FieldRuleDependency
    (
        FieldRuleDependencyId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_FieldRuleDependency_Id DEFAULT NEWSEQUENTIALID(),
        WorkspaceId          UNIQUEIDENTIFIER NOT NULL,
        ObjectType           NVARCHAR(16)     NOT NULL,
        -- The dependent field (carries a rule or derivation).
        FromFieldKey         NVARCHAR(64)     NOT NULL,
        -- The field it depends on (referenced in the condition or expression).
        ToFieldKey           NVARCHAR(64)     NOT NULL,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_FieldRuleDependency_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_FieldRuleDependency_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_FieldRuleDependency_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_FieldRuleDependency PRIMARY KEY CLUSTERED (FieldRuleDependencyId),
        CONSTRAINT FK_FieldRuleDependency_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_FieldRuleDependency_ObjectType CHECK (ObjectType IN (N'Request', N'Task', N'Feature'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    CREATE NONCLUSTERED INDEX IX_FieldRuleDependency_WorkspaceId ON dbo.FieldRuleDependency (WorkspaceId);
GO

-- The graph walk reads all edges for a (workspace, object type).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FieldRuleDependency_Workspace_Object' AND object_id = OBJECT_ID(N'dbo.FieldRuleDependency'))
    CREATE NONCLUSTERED INDEX IX_FieldRuleDependency_Workspace_Object
        ON dbo.FieldRuleDependency (WorkspaceId, ObjectType)
        INCLUDE (FromFieldKey, ToFieldKey) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_018_CreateFieldRuleDependency')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_018_CreateFieldRuleDependency', SUSER_SNAME(), N'Slice 3 — FieldRuleDependency table.');
END;
GO
