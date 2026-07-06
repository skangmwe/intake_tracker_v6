-- =============================================
-- Author:      /dev-build-application (Slice 15 — Search)
-- Create Date: 2026-07-05
-- Description: The full workspace Search surface (S27, BS §9.5). Returns a page of access-
--              respecting hits across three sources in the caller's workspace — Request fields
--              (Name / Description / RecordId / Legacy ID), Comment bodies, and Attachment
--              filenames — each carrying the parent record's Name/Stage/Origin, a match-kind, and
--              a plain-text snippet the UI highlights client-side. No OCR: attachments match on
--              filename only.
--
--              Access is a single WorkspaceMembership gate on the searched workspace (workspace
--              membership is the read model — every source table carries a per-side WorkspaceId
--              and is scoped to @WorkspaceId). A non-member (or an empty query) gets an empty page
--              and a zero count — never a disclosure. Matching is a LIKE-based token overlap, NOT
--              SQL Server full-text: the dev/test stack is LocalDB, which has no Full-Text
--              component (same resolution as slice 6, approved at slice-15 plan-confirmation).
--
--              Two result sets: (1) the page rows, (2) a single-column TotalCount. Snippets are
--              returned as raw text (LEFT-truncated); the UI highlights matched tokens — SQL never
--              emits HTML (no injection surface).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SearchFull
    @WorkspaceId NVARCHAR(64),
    @UserId      UNIQUEIDENTIFIER,
    @Query       NVARCHAR(400),
    @Page        INT = 1,
    @PageSize    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws        UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, @WorkspaceId);
    DECLARE @User      UNIQUEIDENTIFIER = @UserId;
    DECLARE @Q         NVARCHAR(400)    = LTRIM(RTRIM(ISNULL(@Query, N'')));
    DECLARE @PageLocal INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size      INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @SnippetLen INT = 200;

    DECLARE @HasAccess BIT =
        CASE WHEN @Ws IS NOT NULL AND EXISTS (
            SELECT 1 FROM dbo.WorkspaceMembership AS m
            WHERE m.WorkspaceId = @Ws AND m.UserId = @User AND m.IsDeleted = 0)
        THEN 1 ELSE 0 END;

    -- Empty query OR no access → an empty page + a zero count. Both result sets are always emitted
    -- (with the page-row column shape) so the caller reads them uniformly.
    IF @Q = N'' OR @HasAccess = 0
    BEGIN
        SELECT
            CAST(NULL AS NVARCHAR(20))  AS RecordId,
            CAST(NULL AS NVARCHAR(400)) AS Name,
            CAST(NULL AS NVARCHAR(64))  AS Stage,
            CAST(NULL AS NVARCHAR(200)) AS Origin,
            CAST(NULL AS NVARCHAR(16))  AS MatchKind,
            CAST(NULL AS NVARCHAR(400)) AS Snippet
        WHERE 1 = 0;

        SELECT 0 AS TotalCount;
        RETURN;
    END;

    -- Tokens >= 3 chars, lower-cased, LIKE-metacharacters escaped, deduplicated.
    DECLARE @Tokens TABLE (Token NVARCHAR(120) PRIMARY KEY);
    INSERT INTO @Tokens (Token)
    SELECT DISTINCT
        REPLACE(REPLACE(REPLACE(LOWER(value), N'[', N'\['), N'%', N'\%'), N'_', N'\_')
    FROM STRING_SPLIT(@Q, N' ')
    WHERE LEN(value) >= 3;

    IF NOT EXISTS (SELECT 1 FROM @Tokens)
        INSERT INTO @Tokens (Token)
        VALUES (REPLACE(REPLACE(REPLACE(LOWER(@Q), N'[', N'\['), N'%', N'\%'), N'_', N'\_'));

    -- All matches across the three sources, materialised once (reused by the page + the count).
    CREATE TABLE #Matches (
        RecordId       NVARCHAR(20)  NOT NULL,
        Name           NVARCHAR(400) NULL,
        Stage          NVARCHAR(64)  NULL,
        Origin         NVARCHAR(200) NULL,
        MatchKind      NVARCHAR(16)  NOT NULL,
        MatchKindOrder INT           NOT NULL,
        Snippet        NVARCHAR(400) NULL,
        Score          INT           NOT NULL,
        Recency        DATETIME2     NOT NULL
    );

    -- 1) Records — match on Name / Description / RecordId / Legacy ID.
    INSERT INTO #Matches (RecordId, Name, Stage, Origin, MatchKind, MatchKindOrder, Snippet, Score, Recency)
    SELECT
        r.RecordId, r.Name, r.Stage, r.Origin, N'record', 1,
        LEFT(ISNULL(NULLIF(r.Description, N''), r.Name), @SnippetLen), s.Score, r.UpdatedAt
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
      AND s.Score > 0;

    -- 2) Comment bodies — join the parent record (same side) for its Name/Stage/Origin.
    INSERT INTO #Matches (RecordId, Name, Stage, Origin, MatchKind, MatchKindOrder, Snippet, Score, Recency)
    SELECT
        r.RecordId, r.Name, r.Stage, r.Origin, N'comment', 2,
        LEFT(c.Body, @SnippetLen), s.Score, c.CreatedAt
    FROM dbo.Comments AS c
    INNER JOIN dbo.Requests AS r
        ON r.RecordId = c.RecordId AND r.WorkspaceId = c.WorkspaceId AND r.IsDeleted = 0
    CROSS APPLY (
        SELECT COUNT(*) AS Score
        FROM @Tokens AS t
        WHERE LOWER(c.Body) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
    ) AS s
    WHERE c.WorkspaceId = @Ws
      AND c.IsDeleted = 0
      AND c.ObjectType = N'Request'
      AND s.Score > 0;

    -- 3) Attachment filenames — no OCR, filename only.
    INSERT INTO #Matches (RecordId, Name, Stage, Origin, MatchKind, MatchKindOrder, Snippet, Score, Recency)
    SELECT
        r.RecordId, r.Name, r.Stage, r.Origin, N'attachment', 3,
        LEFT(a.FileName, @SnippetLen), s.Score, a.CreatedAt
    FROM dbo.Attachments AS a
    INNER JOIN dbo.Requests AS r
        ON r.RecordId = a.RecordId AND r.WorkspaceId = a.WorkspaceId AND r.IsDeleted = 0
    CROSS APPLY (
        SELECT COUNT(*) AS Score
        FROM @Tokens AS t
        WHERE LOWER(a.FileName) LIKE N'%' + t.Token + N'%' ESCAPE N'\'
    ) AS s
    WHERE a.WorkspaceId = @Ws
      AND a.IsDeleted = 0
      AND a.ObjectType = N'Request'
      AND s.Score > 0;

    -- Page: a record's matches stay contiguous (the UI groups by record); best-scoring, most-recent
    -- records first. RecordId + MatchKindOrder make the order deterministic within a record.
    ;WITH Ranked AS (
        SELECT
            RecordId, Name, Stage, Origin, MatchKind, Snippet, MatchKindOrder,
            MAX(Score)   OVER (PARTITION BY RecordId) AS RecordScore,
            MAX(Recency) OVER (PARTITION BY RecordId) AS RecordRecency
        FROM #Matches
    )
    SELECT RecordId, Name, Stage, Origin, MatchKind, Snippet
    FROM Ranked
    ORDER BY RecordScore DESC, RecordRecency DESC, RecordId ASC, MatchKindOrder ASC
    OFFSET (@PageLocal - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;

    -- Total match count for pagination.
    SELECT COUNT(*) AS TotalCount FROM #Matches;

    DROP TABLE #Matches;
END;
GO
