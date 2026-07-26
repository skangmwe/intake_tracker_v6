-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Creates a new Ask conversation owned by @UserId in @WorkspaceId and returns its ConversationId.
--              The caller (AskController) has already verified the user is a workspace member; this proc just
--              records the owned thread. Header + boilerplate per database-stored-procedures.md.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateAiConversation
    @WorkspaceId UNIQUEIDENTIFIER,
    @UserId      UNIQUEIDENTIFIER,
    @Title       NVARCHAR(200),
    @By          NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @User  UNIQUEIDENTIFIER = @UserId;
    DECLARE @T     NVARCHAR(200)    = @Title;
    DECLARE @Actor NVARCHAR(256)    = @By;

    INSERT INTO dbo.AiConversation (WorkspaceId, UserId, Title, CreatedBy, UpdatedBy)
    OUTPUT inserted.ConversationId AS ConversationId
    VALUES (@Ws, @User, @T, @Actor, @Actor);
END;
GO
