-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Creates dbo.TaskBundleTemplate — a named, workspace-scoped set of tasks applied
--              together on the Tasks & gates composer (blueprint "Task bundle templates"). Each
--              template's task set lives in a TasksJson array of { title, phase } entries; applying
--              a template appends those as Open tasks with the right phase (usp_ApplyTaskBundle).
--              Seeded on the AI Solutions workspace (the build hub) in 20260704_035; other
--              workspaces build their own via admin surfaces later. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.TaskBundleTemplate', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaskBundleTemplate
    (
        TaskBundleTemplateId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TaskBundleTemplate_Id DEFAULT NEWSEQUENTIALID(),
        WorkspaceId          UNIQUEIDENTIFIER NOT NULL,
        -- Stable machine key (e.g. 'extraction-review-build'); unique per workspace.
        TemplateKey          NVARCHAR(64)     NOT NULL,
        Name                 NVARCHAR(200)    NOT NULL,
        -- JSON array of { "title": ..., "phase": ... }. Applied set-based via OPENJSON.
        TasksJson            NVARCHAR(MAX)    NOT NULL,
        SortOrder            INT              NOT NULL CONSTRAINT DF_TaskBundleTemplate_SortOrder DEFAULT 0,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_TaskBundleTemplate_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_TaskBundleTemplate_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_TaskBundleTemplate_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_TaskBundleTemplate PRIMARY KEY CLUSTERED (TaskBundleTemplateId),
        CONSTRAINT FK_TaskBundleTemplate_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_TaskBundleTemplate_TasksJson CHECK (ISJSON(TasksJson) = 1)
    );
END;
GO

-- FK index on WorkspaceId; also the list-read path (templates for a workspace, in SortOrder).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TaskBundleTemplate_Workspace' AND object_id = OBJECT_ID(N'dbo.TaskBundleTemplate'))
    CREATE NONCLUSTERED INDEX IX_TaskBundleTemplate_Workspace
        ON dbo.TaskBundleTemplate (WorkspaceId, SortOrder) WHERE IsDeleted = 0;
GO

-- One template per key per workspace (race backstop + idempotent seed).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_TaskBundleTemplate_Workspace_Key' AND object_id = OBJECT_ID(N'dbo.TaskBundleTemplate'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_TaskBundleTemplate_Workspace_Key
        ON dbo.TaskBundleTemplate (WorkspaceId, TemplateKey) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_034_CreateTaskBundleTemplate')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_034_CreateTaskBundleTemplate', SUSER_SNAME(), N'Slice 7 — TaskBundleTemplate table.');
END;
GO
