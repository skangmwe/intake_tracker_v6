-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Returns the ordered messages of a conversation the caller OWNS. The ownership gate is the
--              non-disclosure boundary: if (@ConversationId, @UserId) is not a live owned thread the proc THROWs
--              (52002) — it never returns another user's messages, and never confirms a foreign conversation's
--              existence with data. An owned-but-empty conversation returns zero rows (no throw). Messages are
--              ordered by CreatedAt then MessageId for a stable read. Content is Confidential — never logged.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetAiConversation
    @ConversationId UNIQUEIDENTIFIER,
    @UserId         UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Cid  UNIQUEIDENTIFIER = @ConversationId;
    DECLARE @User UNIQUEIDENTIFIER = @UserId;

    -- Non-disclosure gate: only the owner may read; a non-owner/absent thread is indistinguishable "not found".
    IF NOT EXISTS (
        SELECT 1 FROM dbo.AiConversation
        WHERE ConversationId = @Cid AND UserId = @User AND IsDeleted = 0)
        THROW 52002, N'Conversation not found.', 1;

    SELECT
        m.MessageId,
        m.Role,
        m.Content,
        m.CitationsJson,
        m.Feedback,
        m.CreatedAt
    FROM dbo.AiConversationMessage AS m
    WHERE m.ConversationId = @Cid
      AND m.IsDeleted = 0
    ORDER BY m.CreatedAt, m.MessageId;
END;
GO
