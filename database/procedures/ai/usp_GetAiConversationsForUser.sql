-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 3 Ask)
-- Create Date: 2026-07-25
-- Description: Lists the caller's own Ask conversations in a workspace, newest-activity first, paginated
--              (OFFSET/FETCH). Scoped on (WorkspaceId, UserId) so a user only ever sees their own threads.
--              Each row carries a windowed TotalCount so the API can build the paginated envelope in one round
--              trip. @Page is 1-based; @PageSize is validated at the controller (default 20, max 100).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetAiConversationsForUser
    @WorkspaceId UNIQUEIDENTIFIER,
    @UserId      UNIQUEIDENTIFIER,
    @Page        INT,
    @PageSize    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;
    DECLARE @Offset INT = (@Page - 1) * @PageSize;

    SELECT
        c.ConversationId,
        c.Title,
        c.CreatedAt,
        c.UpdatedAt,
        COUNT(*) OVER () AS TotalCount
    FROM dbo.AiConversation AS c
    WHERE c.WorkspaceId = @Ws
      AND c.UserId = @User
      AND c.IsDeleted = 0
    ORDER BY c.UpdatedAt DESC, c.ConversationId
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
