-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Creates dbo.AiConversation — the per-user "Ask" conversation thread (BS §14). One row per
--              conversation, owned by exactly one user in exactly one workspace. Ownership is the invariant:
--              every read/write proc scopes on (ConversationId, UserId) so one user can never see another's
--              conversation. Title is an optional short label. Messages live in the child dbo.AiConversationMessage
--              (migration 098). Six audit columns + soft-delete like every table (database-coding-standards.md).
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.AiConversation', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AiConversation
    (
        ConversationId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_AiConversation_ConversationId DEFAULT NEWID(),
        WorkspaceId    UNIQUEIDENTIFIER NOT NULL,
        -- The owning user (Entra oid). Every read/write is scoped on this — the ownership invariant.
        UserId         UNIQUEIDENTIFIER NOT NULL,
        -- Optional short label for the thread. Null until named.
        Title          NVARCHAR(200)    NULL,

        CreatedAt      DATETIME2        NOT NULL CONSTRAINT DF_AiConversation_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt      DATETIME2        NOT NULL CONSTRAINT DF_AiConversation_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy      NVARCHAR(256)    NOT NULL,
        UpdatedBy      NVARCHAR(256)    NOT NULL,
        IsDeleted      BIT              NOT NULL CONSTRAINT DF_AiConversation_IsDeleted DEFAULT 0,
        DeletedAt      DATETIME2        NULL,

        CONSTRAINT PK_AiConversation PRIMARY KEY CLUSTERED (ConversationId),
        CONSTRAINT FK_AiConversation_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- FK index for WorkspaceId (database-performance.md — every FK gets a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AiConversation_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.AiConversation'))
    CREATE NONCLUSTERED INDEX IX_AiConversation_WorkspaceId ON dbo.AiConversation (WorkspaceId);
GO

-- The owner-scoped list path (usp_GetAiConversationsForUser) filters on (UserId, WorkspaceId) newest-first, so
-- the list index leads with the two equality columns.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AiConversation_User_Workspace' AND object_id = OBJECT_ID(N'dbo.AiConversation'))
    CREATE NONCLUSTERED INDEX IX_AiConversation_User_Workspace ON dbo.AiConversation (UserId, WorkspaceId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_097_CreateAiConversation')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260725_097_CreateAiConversation', SUSER_SNAME(), N'Phase 4 Slice 3 — per-user Ask conversation thread.');
END;
GO
