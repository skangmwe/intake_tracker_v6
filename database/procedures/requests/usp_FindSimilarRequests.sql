-- =============================================
-- Author:      /dev-build-application (Slice 6 — Similar-requests nudge)
-- Create Date: 2026-07-04
-- Description: The intake similar-requests nudge (BS §9.8). Returns up to @Top existing
--              Requests in the caller's workspace whose Name or Description overlaps the typed
--              query, ordered by token-overlap score then recency. Access is baked into the
--              query via a WorkspaceMembership join — a non-member gets ZERO rows (never a
--              disclosure). Workspace-scoped, so a match never leaks across workspaces
--              (BS §9.5).
--
--              Matching is a LIKE-based token overlap, NOT SQL Server full-text: the dev/test
--              stack is LocalDB, which has no Full-Text component, and the real access-respecting
--              full-text Search surface is slice 15. This nudge only needs a small top-N
--              typeahead. Tokens shorter than 3 chars are ignored; wildcard characters in the
--              query are escaped so user text can't act as a LIKE pattern.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_FindSimilarRequests
    @WorkspaceId UNIQUEIDENTIFIER,
    @UserId      UNIQUEIDENTIFIER,
    @Query       NVARCHAR(400),
    @Top         INT = 3
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @User UNIQUEIDENTIFIER = @UserId;
    DECLARE @Q    NVARCHAR(400)    = LTRIM(RTRIM(ISNULL(@Query, N'')));
    DECLARE @TopN INT              =
        CASE WHEN @Top IS NULL OR @Top < 1 THEN 3 WHEN @Top > 10 THEN 10 ELSE @Top END;

    IF @Q = N''
        RETURN;

    -- Access gate: the caller must be a member of the workspace being searched.
    IF NOT EXISTS (
        SELECT 1 FROM dbo.WorkspaceMembership AS m
        WHERE m.WorkspaceId = @Ws AND m.UserId = @User AND m.IsDeleted = 0)
        RETURN;

    -- Tokens >= 3 chars, lower-cased, LIKE-metacharacters escaped, deduplicated.
    DECLARE @Tokens TABLE (Token NVARCHAR(120) PRIMARY KEY);
    INSERT INTO @Tokens (Token)
    SELECT DISTINCT
        REPLACE(REPLACE(REPLACE(LOWER(value), N'[', N'\['), N'%', N'\%'), N'_', N'\_')
    FROM STRING_SPLIT(@Q, N' ')
    WHERE LEN(value) >= 3;

    -- If every token was too short, fall back to the whole trimmed query as one token.
    IF NOT EXISTS (SELECT 1 FROM @Tokens)
        INSERT INTO @Tokens (Token)
        VALUES (REPLACE(REPLACE(REPLACE(LOWER(@Q), N'[', N'\['), N'%', N'\%'), N'_', N'\_'));

    SELECT TOP (@TopN)
        r.RecordId,
        r.Name,
        r.Stage,
        r.Origin
    FROM dbo.Requests AS r
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
    CROSS APPLY (
        SELECT COUNT(*) AS Score
        FROM @Tokens AS t
        WHERE LOWER(r.Name) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
           OR LOWER(ISNULL(r.Description, N'')) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
    ) AS s
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND s.Score > 0
    ORDER BY s.Score DESC, r.UpdatedAt DESC;
END;
GO
