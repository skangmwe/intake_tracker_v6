-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Creates dbo.WorkspaceMembership — one row per (workspace, user) with
--              a per-workspace access level (BS §4.2). The additive firm-wide
--              "Platform admin" grant is NOT a column here; it is the separate
--              dbo.PlatformAdminGrant table (single source of truth — see
--              data-model.md note, slice 1 decision). Idempotent.
--
--              BoundDashboardId is added now (nullable) but its FK to SavedDashboard
--              is deferred to slice 23 where dbo.SavedDashboards is created.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.WorkspaceMembership', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.WorkspaceMembership
    (
        MembershipId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkspaceMembership_MembershipId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId        UNIQUEIDENTIFIER NOT NULL,
        UserId             UNIQUEIDENTIFIER NOT NULL,
        -- 'Viewer' | 'Member' | 'WorkspaceAdmin'
        Level              NVARCHAR(32)     NOT NULL,
        -- Viewer bound to one dashboard as sole surface (BS §10.4).
        IsDashboardViewer  BIT              NOT NULL CONSTRAINT DF_WorkspaceMembership_IsDashboardViewer DEFAULT 0,
        BoundDashboardId   UNIQUEIDENTIFIER NULL,

        CreatedAt          DATETIME2        NOT NULL CONSTRAINT DF_WorkspaceMembership_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt          DATETIME2        NOT NULL CONSTRAINT DF_WorkspaceMembership_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy          NVARCHAR(256)    NOT NULL,
        UpdatedBy          NVARCHAR(256)    NOT NULL,
        IsDeleted          BIT              NOT NULL CONSTRAINT DF_WorkspaceMembership_IsDeleted DEFAULT 0,
        DeletedAt          DATETIME2        NULL,

        CONSTRAINT PK_WorkspaceMembership PRIMARY KEY CLUSTERED (MembershipId),
        CONSTRAINT FK_WorkspaceMembership_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_WorkspaceMembership_Users FOREIGN KEY (UserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_WorkspaceMembership_Level CHECK (Level IN (N'Viewer', N'Member', N'WorkspaceAdmin'))
    );
END;
GO

-- FK indexes (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WorkspaceMembership_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.WorkspaceMembership'))
    CREATE NONCLUSTERED INDEX IX_WorkspaceMembership_WorkspaceId ON dbo.WorkspaceMembership (WorkspaceId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WorkspaceMembership_UserId' AND object_id = OBJECT_ID(N'dbo.WorkspaceMembership'))
    CREATE NONCLUSTERED INDEX IX_WorkspaceMembership_UserId ON dbo.WorkspaceMembership (UserId);
GO

-- One active membership per (workspace, user).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_WorkspaceMembership_Workspace_User' AND object_id = OBJECT_ID(N'dbo.WorkspaceMembership'))
    CREATE UNIQUE INDEX UX_WorkspaceMembership_Workspace_User ON dbo.WorkspaceMembership (WorkspaceId, UserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_004_CreateWorkspaceMembership')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_004_CreateWorkspaceMembership', SUSER_SNAME(), N'Slice 1 — WorkspaceMembership table.');
END;
GO
