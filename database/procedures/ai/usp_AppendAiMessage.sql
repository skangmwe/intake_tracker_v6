-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Appends one message (user or assistant turn) to a conversation the caller OWNS, and bumps the
--              parent's UpdatedAt. The ownership gate is authoritative — a caller can never write into another
--              user's conversation: if (@ConversationId, @UserId) is not a live owned thread the proc THROWs and
--              inserts nothing. CitationsJson is null on user turns / when no source was cited. Returns the new
--              MessageId. Content is Confidential — never logged (api-pii-handling.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_AppendAiMessage
    @ConversationId UNIQUEIDENTIFIER,
    @UserId         UNIQUEIDENTIFIER,
    @Role           NVARCHAR(16),
    @Content        NVARCHAR(MAX),
    @CitationsJson  NVARCHAR(MAX),
    @By             NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Cid   UNIQUEIDENTIFIER = @ConversationId;
    DECLARE @User  UNIQUEIDENTIFIER = @UserId;
    DECLARE @R     NVARCHAR(16)     = @Role;
    DECLARE @Body  NVARCHAR(MAX)    = @Content;
    DECLARE @Cites NVARCHAR(MAX)    = @CitationsJson;
    DECLARE @Actor NVARCHAR(256)    = @By;

    -- Write ownership gate: the conversation must exist and belong to the caller.
    IF NOT EXISTS (
        SELECT 1 FROM dbo.AiConversation
        WHERE ConversationId = @Cid AND UserId = @User AND IsDeleted = 0)
        THROW 52001, N'Conversation not found or not owned by the caller.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Inserted TABLE (MessageId UNIQUEIDENTIFIER);

        INSERT INTO dbo.AiConversationMessage (ConversationId, Role, Content, CitationsJson, CreatedBy, UpdatedBy)
        OUTPUT inserted.MessageId INTO @Inserted (MessageId)
        VALUES (@Cid, @R, @Body, @Cites, @Actor, @Actor);

        UPDATE dbo.AiConversation
        SET UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @Actor
        WHERE ConversationId = @Cid;

        COMMIT TRANSACTION;

        SELECT MessageId FROM @Inserted;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
