-- =============================================
-- Author:      /dev-build-application (Slice 15 — Search)
-- Create Date: 2026-07-05
-- Description: The top-bar workspace search (records-only). Returns up to @Top existing Requests
--              in the caller's workspace whose Name, Description, RecordId, or Legacy ID overlaps
--              the typed query, ordered by token-overlap score then recency (BS §9.5). Access is
--              gated by a WorkspaceMembership check — a non-member gets ZERO rows (never a
--              disclosure). Workspace-scoped, so a match never crosses a workspace.
--
--              Matching is a LIKE-based token overlap, NOT SQL Server full-text: the dev/test
--              stack is LocalDB, which has no Full-Text component (same resolution as slice 6's
--              similar-requests nudge, approved at slice-15 plan-confirmation). Tokens shorter
--              than 3 chars are ignored; LIKE metacharacters in the query are escaped so user
--              text can't act as a pattern. Legacy ID lives in the FieldValues JSON map
--              ($.legacyId) — populated by CSV import (slice 16); searchable per BS §9.5.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SearchRecords
    @WorkspaceId NVARCHAR(64),
    @UserId      UNIQUEIDENTIFIER,
    @Query       NVARCHAR(400),
    @Top         INT = 6
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, @WorkspaceId);
    DECLARE @User UNIQUEIDENTIFIER = @UserId;
    DECLARE @Q    NVARCHAR(400)    = LTRIM(RTRIM(ISNULL(@Query, N'')));
    DECLARE @TopN INT              =
        CASE WHEN @Top IS NULL OR @Top < 1 THEN 6 WHEN @Top > 20 THEN 20 ELSE @Top END;

    IF @Ws IS NULL OR @Q = N''
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
    CROSS APPLY (
        SELECT COUNT(*) AS Score
        FROM @Tokens AS t
        WHERE LOWER(r.Name) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
           OR LOWER(ISNULL(r.Description, N'')) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
           OR LOWER(r.RecordId) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
           OR LOWER(ISNULL(JSON_VALUE(r.FieldValues, N'$.legacyId'), N'')) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
    ) AS s
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND s.Score > 0
    ORDER BY s.Score DESC, r.UpdatedAt DESC;
END;
GO
