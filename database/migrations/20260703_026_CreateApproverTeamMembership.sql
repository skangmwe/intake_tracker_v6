-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Creates dbo.ApproverTeamMembership — role-label -> real workspace user,
--              per workspace (S31 Approver teams; BS §7.2). Powers the roster and the live
--              "N eligible" count; slice 8 freezes eligible UserIds at gate-open. Members
--              are real Users (resolved from a typed name/email at add time), never free
--              text. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ApproverTeamMembership', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApproverTeamMembership
    (
        ApproverTeamMembershipId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ApproverTeamMembership_Id DEFAULT NEWSEQUENTIALID(),
        WorkspaceId              UNIQUEIDENTIFIER NOT NULL,
        RoleLabel                NVARCHAR(120)    NOT NULL,
        UserId                   UNIQUEIDENTIFIER NOT NULL,

        CreatedAt                DATETIME2        NOT NULL CONSTRAINT DF_ApproverTeamMembership_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt                DATETIME2        NOT NULL CONSTRAINT DF_ApproverTeamMembership_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy                NVARCHAR(256)    NOT NULL,
        UpdatedBy                NVARCHAR(256)    NOT NULL,
        IsDeleted                BIT              NOT NULL CONSTRAINT DF_ApproverTeamMembership_IsDeleted DEFAULT 0,
        DeletedAt                DATETIME2        NULL,

        CONSTRAINT PK_ApproverTeamMembership PRIMARY KEY CLUSTERED (ApproverTeamMembershipId),
        CONSTRAINT FK_ApproverTeamMembership_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_ApproverTeamMembership_Users FOREIGN KEY (UserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ApproverTeamMembership_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.ApproverTeamMembership'))
    CREATE NONCLUSTERED INDEX IX_ApproverTeamMembership_WorkspaceId
        ON dbo.ApproverTeamMembership (WorkspaceId, RoleLabel)
        INCLUDE (UserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ApproverTeamMembership_UserId' AND object_id = OBJECT_ID(N'dbo.ApproverTeamMembership'))
    CREATE NONCLUSTERED INDEX IX_ApproverTeamMembership_UserId ON dbo.ApproverTeamMembership (UserId);
GO

-- One active membership per (workspace, role label, user).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ApproverTeamMembership_Ws_Role_User' AND object_id = OBJECT_ID(N'dbo.ApproverTeamMembership'))
    CREATE UNIQUE INDEX UX_ApproverTeamMembership_Ws_Role_User
        ON dbo.ApproverTeamMembership (WorkspaceId, RoleLabel, UserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_026_CreateApproverTeamMembership')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_026_CreateApproverTeamMembership', SUSER_SNAME(), N'Slice 4 — ApproverTeamMembership table.');
END;
GO
