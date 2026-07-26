-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Creates dbo.AiConversationMessage — the ordered turns of an Ask conversation (BS §14). One row per
--              user or assistant message, child of dbo.AiConversation (migration 097). Content is the message
--              text; CitationsJson is the assistant turn's cited-source list (null on user turns / when no source
--              was cited); Feedback is the user's thumbs rating on an assistant turn ('up' / 'down' / null).
--              Turn order is CreatedAt (the audit column). Role is constrained to 'user' / 'assistant'; Feedback
--              to 'up' / 'down'. Six audit columns + soft-delete like every table (database-coding-standards.md).
--              Content is Confidential (AI prompt/response text) — never logged (api-pii-handling.md). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.AiConversationMessage', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AiConversationMessage
    (
        MessageId      UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_AiConversationMessage_MessageId DEFAULT NEWID(),
        ConversationId UNIQUEIDENTIFIER NOT NULL,
        -- 'user' or 'assistant' — the turn's author.
        Role           NVARCHAR(16)     NOT NULL,
        -- The message text (user query or assistant answer, the latter with inline [cite:N] markers).
        Content        NVARCHAR(MAX)    NOT NULL,
        -- Assistant turn's cited-source array as JSON (marker → recordId/title). Null on user turns.
        CitationsJson  NVARCHAR(MAX)    NULL,
        -- The user's thumbs rating on an assistant turn: 'up' / 'down'. Null until rated / on user turns.
        Feedback       NVARCHAR(16)     NULL,

        CreatedAt      DATETIME2        NOT NULL CONSTRAINT DF_AiConversationMessage_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt      DATETIME2        NOT NULL CONSTRAINT DF_AiConversationMessage_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy      NVARCHAR(256)    NOT NULL,
        UpdatedBy      NVARCHAR(256)    NOT NULL,
        IsDeleted      BIT              NOT NULL CONSTRAINT DF_AiConversationMessage_IsDeleted DEFAULT 0,
        DeletedAt      DATETIME2        NULL,

        CONSTRAINT PK_AiConversationMessage PRIMARY KEY CLUSTERED (MessageId),
        CONSTRAINT FK_AiConversationMessage_AiConversation FOREIGN KEY (ConversationId)
            REFERENCES dbo.AiConversation (ConversationId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_AiConversationMessage_Role CHECK (Role IN (N'user', N'assistant')),
        CONSTRAINT CK_AiConversationMessage_Feedback CHECK (Feedback IS NULL OR Feedback IN (N'up', N'down'))
    );
END;
GO

-- FK index + the in-order read path (usp_GetAiConversation reads a conversation's messages by CreatedAt).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AiConversationMessage_Conversation' AND object_id = OBJECT_ID(N'dbo.AiConversationMessage'))
    CREATE NONCLUSTERED INDEX IX_AiConversationMessage_Conversation ON dbo.AiConversationMessage (ConversationId, CreatedAt) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_098_CreateAiConversationMessage')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260725_098_CreateAiConversationMessage', SUSER_SNAME(), N'Phase 4 Slice 3 — ordered Ask conversation messages.');
END;
GO
