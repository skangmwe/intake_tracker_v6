-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Records the caller's thumbs rating ('up' / 'down') on a message in a conversation they OWN. The
--              ownership gate joins the message's parent conversation and requires (UserId, live) — a caller can
--              never rate a message in another user's conversation (THROW 52003, no update). @Feedback is
--              constrained to 'up' / 'down' by the table CHECK. Header + boilerplate per stored-procedures rule.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SetAiMessageFeedback
    @MessageId UNIQUEIDENTIFIER,
    @UserId    UNIQUEIDENTIFIER,
    @Feedback  NVARCHAR(16),
    @By        NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Mid   UNIQUEIDENTIFIER = @MessageId;
    DECLARE @User  UNIQUEIDENTIFIER = @UserId;
    DECLARE @Vote  NVARCHAR(16)     = @Feedback;
    DECLARE @Actor NVARCHAR(256)    = @By;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.AiConversationMessage AS m
        INNER JOIN dbo.AiConversation AS c
            ON c.ConversationId = m.ConversationId AND c.UserId = @User AND c.IsDeleted = 0
        WHERE m.MessageId = @Mid AND m.IsDeleted = 0)
        THROW 52003, N'Message not found or not owned by the caller.', 1;

    UPDATE dbo.AiConversationMessage
    SET Feedback = @Vote, UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @Actor
    WHERE MessageId = @Mid AND IsDeleted = 0;
END;
GO
