-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Creates dbo.UserGroup (per-workspace named group, e.g. the seeded
--              "AI Intake" group) and dbo.UserGroupMembership (users in a group).
--              One logical unit — a group and its membership. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.UserGroup', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserGroup
    (
        UserGroupId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_UserGroup_UserGroupId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId  UNIQUEIDENTIFIER NOT NULL,
        Name         NVARCHAR(200)    NOT NULL,
        -- Stable machine key for seeded groups, e.g. 'ai-intake'.
        GroupKey     NVARCHAR(64)     NOT NULL,

        CreatedAt    DATETIME2        NOT NULL CONSTRAINT DF_UserGroup_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2        NOT NULL CONSTRAINT DF_UserGroup_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy    NVARCHAR(256)    NOT NULL,
        UpdatedBy    NVARCHAR(256)    NOT NULL,
        IsDeleted    BIT              NOT NULL CONSTRAINT DF_UserGroup_IsDeleted DEFAULT 0,
        DeletedAt    DATETIME2        NULL,

        CONSTRAINT PK_UserGroup PRIMARY KEY CLUSTERED (UserGroupId),
        CONSTRAINT FK_UserGroup_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_UserGroup_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.UserGroup'))
    CREATE NONCLUSTERED INDEX IX_UserGroup_WorkspaceId ON dbo.UserGroup (WorkspaceId);
GO

-- One group per (workspace, key).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_UserGroup_Workspace_Key' AND object_id = OBJECT_ID(N'dbo.UserGroup'))
    CREATE UNIQUE INDEX UX_UserGroup_Workspace_Key ON dbo.UserGroup (WorkspaceId, GroupKey) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'dbo.UserGroupMembership', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserGroupMembership
    (
        UserGroupMembershipId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_UserGroupMembership_Id DEFAULT NEWSEQUENTIALID(),
        UserGroupId            UNIQUEIDENTIFIER NOT NULL,
        UserId                 UNIQUEIDENTIFIER NOT NULL,

        CreatedAt              DATETIME2        NOT NULL CONSTRAINT DF_UserGroupMembership_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt              DATETIME2        NOT NULL CONSTRAINT DF_UserGroupMembership_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy              NVARCHAR(256)    NOT NULL,
        UpdatedBy              NVARCHAR(256)    NOT NULL,
        IsDeleted              BIT              NOT NULL CONSTRAINT DF_UserGroupMembership_IsDeleted DEFAULT 0,
        DeletedAt              DATETIME2        NULL,

        CONSTRAINT PK_UserGroupMembership PRIMARY KEY CLUSTERED (UserGroupMembershipId),
        CONSTRAINT FK_UserGroupMembership_UserGroup FOREIGN KEY (UserGroupId)
            REFERENCES dbo.UserGroup (UserGroupId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_UserGroupMembership_Users FOREIGN KEY (UserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_UserGroupMembership_UserGroupId' AND object_id = OBJECT_ID(N'dbo.UserGroupMembership'))
    CREATE NONCLUSTERED INDEX IX_UserGroupMembership_UserGroupId ON dbo.UserGroupMembership (UserGroupId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_UserGroupMembership_UserId' AND object_id = OBJECT_ID(N'dbo.UserGroupMembership'))
    CREATE NONCLUSTERED INDEX IX_UserGroupMembership_UserId ON dbo.UserGroupMembership (UserId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_UserGroupMembership_Group_User' AND object_id = OBJECT_ID(N'dbo.UserGroupMembership'))
    CREATE UNIQUE INDEX UX_UserGroupMembership_Group_User ON dbo.UserGroupMembership (UserGroupId, UserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_008_CreateUserGroups')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_008_CreateUserGroups', SUSER_SNAME(), N'Slice 1 — UserGroup + UserGroupMembership tables.');
END;
GO
