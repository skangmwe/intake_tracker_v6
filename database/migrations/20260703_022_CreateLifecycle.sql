-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Creates dbo.Lifecycle — a workspace's per-request-type process (S31,
--              BS §7.1 "lifecycle as data"). A workspace owns many lifecycles; exactly
--              one is the default (filtered unique index). A request selects its lifecycle
--              at intake via RequestType. Stages and gates are lifecycle-scoped (023/024).
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Lifecycle', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Lifecycle
    (
        LifecycleId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Lifecycle_LifecycleId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId  UNIQUEIDENTIFIER NOT NULL,
        Name         NVARCHAR(200)    NOT NULL,
        -- The type a request picks at intake to select this lifecycle.
        RequestType  NVARCHAR(120)    NOT NULL,
        IsDefault    BIT              NOT NULL CONSTRAINT DF_Lifecycle_IsDefault DEFAULT 0,
        SortOrder    INT              NOT NULL CONSTRAINT DF_Lifecycle_SortOrder DEFAULT 0,

        CreatedAt    DATETIME2        NOT NULL CONSTRAINT DF_Lifecycle_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2        NOT NULL CONSTRAINT DF_Lifecycle_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy    NVARCHAR(256)    NOT NULL,
        UpdatedBy    NVARCHAR(256)    NOT NULL,
        IsDeleted    BIT              NOT NULL CONSTRAINT DF_Lifecycle_IsDeleted DEFAULT 0,
        DeletedAt    DATETIME2        NULL,

        CONSTRAINT PK_Lifecycle PRIMARY KEY CLUSTERED (LifecycleId),
        CONSTRAINT FK_Lifecycle_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- FK index (database-performance.md — every FK column has a non-clustered index),
-- also covering the workspace-scoped list read ordered by SortOrder.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Lifecycle_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Lifecycle'))
    CREATE NONCLUSTERED INDEX IX_Lifecycle_WorkspaceId
        ON dbo.Lifecycle (WorkspaceId, SortOrder)
        INCLUDE (Name, RequestType, IsDefault) WHERE IsDeleted = 0;
GO

-- At most one default lifecycle per workspace.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Lifecycle_Workspace_Default' AND object_id = OBJECT_ID(N'dbo.Lifecycle'))
    CREATE UNIQUE INDEX UX_Lifecycle_Workspace_Default
        ON dbo.Lifecycle (WorkspaceId) WHERE IsDefault = 1 AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_022_CreateLifecycle')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_022_CreateLifecycle', SUSER_SNAME(), N'Slice 4 — Lifecycle table.');
END;
GO
