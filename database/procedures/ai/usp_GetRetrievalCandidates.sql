-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 2 retrieval)
-- Create Date: 2026-07-25
-- Description: The permission boundary for AI-assist retrieval. Returns the embedded, open (non-closed)
--              Requests in a workspace that the caller is ENTITLED to see, each with its stored vector and a
--              keyword-overlap score. Access is baked into the query via an INNER JOIN on WorkspaceMembership
--              — a non-member gets ZERO rows (never a disclosure), exactly as usp_FindSimilarRequests does.
--              The RecordRetriever ranks these in C# (cosine over the vector, blended with the keyword score)
--              and caps at top-k; this proc deliberately does NOT cap, so the semantic ranker sees the full
--              candidate set (tuned for the 200–500-record workspace scale in the spec).
--
--              KeywordScore reuses the LIKE token-overlap scoring from usp_FindSimilarRequests (LocalDB has no
--              Full-Text; tokens < 3 chars ignored; LIKE metacharacters escaped so user text cannot act as a
--              pattern). Unlike that nudge it does NOT filter Score > 0 — a keyword-0 record can still be the
--              best semantic match. Closed records ($.outcome set in FieldValues, per usp_CloseRequest) and
--              soft-deleted records are excluded. Embedding join is workspace-scoped (an escalated record's
--              same RecordId in another workspace never crosses over). Content is Confidential — never logged.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetRetrievalCandidates
    @WorkspaceId UNIQUEIDENTIFIER,
    @UserId      UNIQUEIDENTIFIER,
    @Query       NVARCHAR(400)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @User UNIQUEIDENTIFIER = @UserId;
    DECLARE @Q    NVARCHAR(400)    = LTRIM(RTRIM(ISNULL(@Query, N'')));

    -- Access gate: the caller must be a member of the workspace being searched. A non-member gets nothing.
    IF NOT EXISTS (
        SELECT 1 FROM dbo.WorkspaceMembership AS m
        WHERE m.WorkspaceId = @Ws AND m.UserId = @User AND m.IsDeleted = 0)
        RETURN;

    -- Tokens >= 3 chars, lower-cased, LIKE-metacharacters escaped, deduplicated. An empty/short query yields
    -- zero tokens → KeywordScore 0 everywhere, and the semantic ranker still orders the candidates.
    DECLARE @Tokens TABLE (Token NVARCHAR(120) PRIMARY KEY);
    INSERT INTO @Tokens (Token)
    SELECT DISTINCT
        REPLACE(REPLACE(REPLACE(LOWER(value), N'[', N'\['), N'%', N'\%'), N'_', N'\_')
    FROM STRING_SPLIT(@Q, N' ')
    WHERE LEN(value) >= 3;

    SELECT
        r.RecordId,
        r.Name AS Title,
        e.Vector,
        s.Score AS KeywordScore
    FROM dbo.Requests AS r
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
    INNER JOIN dbo.RecordEmbedding AS e
        ON e.WorkspaceId = r.WorkspaceId AND e.ObjectType = N'Request' AND e.RecordId = r.RecordId AND e.IsDeleted = 0
    CROSS APPLY (
        SELECT COUNT(*) AS Score
        FROM @Tokens AS t
        WHERE LOWER(r.Name) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
           OR LOWER(ISNULL(r.Description, N'')) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
    ) AS s
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL;  -- open (non-closed) records only
END;
GO
