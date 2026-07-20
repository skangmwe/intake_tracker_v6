-- =============================================
-- Author:      slice/invited-membership-state (Invited membership state — S29)
-- Create Date: 2026-07-20
-- Description: Creates dbo.WorkspaceInvitation — a pending invitation to a workspace for an email
--              that does NOT yet resolve to a platform user (design: 2026-07-20-invited-membership-
--              state-design.md). When a WorkspaceAdmin adds a member by email and the email resolves
--              to an existing active user, they join immediately as an Active WorkspaceMembership
--              (unchanged path). When it does not resolve, one row is written here with Status =
--              'Invited'; on that person's first sign-in the provisioning proc (usp_UpsertUser)
--              converts every pending invitation matching their email into a real membership and marks
--              the invitation 'Accepted'. Cancelling an invite sets Status = 'Cancelled' (soft-cancel).
--
--              Email is PII (api-pii-handling.md) — stored here, never logged. InvitedBy carries the
--              inviting admin's pseudonymous oid (same convention as CreatedBy). A unique filtered index
--              enforces at most one LIVE ('Invited') invite per (workspace, email). Idempotent per
--              database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.WorkspaceInvitation', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.WorkspaceInvitation
    (
        InvitationId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkspaceInvitation_InvitationId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId   UNIQUEIDENTIFIER NOT NULL,
        -- The invited email address (as typed, trimmed). PII — never logged.
        Email         NVARCHAR(320)    NOT NULL,
        -- 'Viewer' | 'Member' | 'WorkspaceAdmin' — the level the accepted membership will carry.
        Level         NVARCHAR(32)     NOT NULL,
        -- 'Invited' (pending) | 'Accepted' (converted to a membership) | 'Cancelled' (soft-cancel).
        Status        NVARCHAR(16)     NOT NULL CONSTRAINT DF_WorkspaceInvitation_Status DEFAULT N'Invited',
        -- The inviting admin's pseudonymous oid (same convention as CreatedBy — never PII).
        InvitedBy     NVARCHAR(256)    NOT NULL,
        -- Set when the invite is converted into a membership on the invitee's first sign-in.
        AcceptedAt    DATETIME2        NULL,

        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_WorkspaceInvitation_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt     DATETIME2        NOT NULL CONSTRAINT DF_WorkspaceInvitation_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,
        IsDeleted     BIT              NOT NULL CONSTRAINT DF_WorkspaceInvitation_IsDeleted DEFAULT 0,
        DeletedAt     DATETIME2        NULL,

        CONSTRAINT PK_WorkspaceInvitation PRIMARY KEY CLUSTERED (InvitationId),
        CONSTRAINT FK_WorkspaceInvitation_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_WorkspaceInvitation_Level CHECK (Level IN (N'Viewer', N'Member', N'WorkspaceAdmin')),
        CONSTRAINT CK_WorkspaceInvitation_Status CHECK (Status IN (N'Invited', N'Accepted', N'Cancelled'))
    );
END;
GO

-- FK index (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WorkspaceInvitation_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.WorkspaceInvitation'))
    CREATE NONCLUSTERED INDEX IX_WorkspaceInvitation_WorkspaceId ON dbo.WorkspaceInvitation (WorkspaceId);
GO

-- Accept-by-email lookup on first sign-in (usp_UpsertUser matches pending invites by email).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WorkspaceInvitation_Email' AND object_id = OBJECT_ID(N'dbo.WorkspaceInvitation'))
    CREATE NONCLUSTERED INDEX IX_WorkspaceInvitation_Email
        ON dbo.WorkspaceInvitation (Email) WHERE Status = N'Invited' AND IsDeleted = 0;
GO

-- At most one LIVE invitation per (workspace, email).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_WorkspaceInvitation_Workspace_Email' AND object_id = OBJECT_ID(N'dbo.WorkspaceInvitation'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_WorkspaceInvitation_Workspace_Email
        ON dbo.WorkspaceInvitation (WorkspaceId, Email) WHERE Status = N'Invited' AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_066_CreateWorkspaceInvitation')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260720_066_CreateWorkspaceInvitation', SUSER_SNAME(), N'Invited membership state — WorkspaceInvitation table (S29).');
END;
GO
