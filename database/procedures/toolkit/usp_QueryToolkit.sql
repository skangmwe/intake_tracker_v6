-- =============================================
-- Author:      /dev-build-application (Slice 29 — Toolkit object + S43 surface)
-- Create Date: 2026-07-19
-- Description: The S43 Toolkit list read. Returns a page of rows for @WorkspaceId plus the total
--              match count. Workspace membership (Viewer+) is verified API-side before this runs, so
--              the proc trusts @WorkspaceId scope; every filter value is parameterised (via OPENJSON
--              of @FiltersJson — never string-built) per api-data-access.md. Sorting is column-
--              whitelisted. Pagination via OFFSET/FETCH.
--
--              @FiltersJson (all keys optional):
--                { "kind": ["Prompt",..], "status": ["Active",..], "maintainer": ["Mia Chen",..],
--                  "nameContains": "clause", "search": "deposition" }
--              `search` matches ANY of Name / OneLiner / Description / Maintainer (the top search box);
--              `nameContains` matches Name only (the per-column name funnel).
--              @SortColumn ∈ {id,name,type,status,maintainer,updated}; @SortDir ∈ {asc,desc}.
--              Two result sets: (1) the page rows, (2) a single-column TotalCount.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryToolkit
    @WorkspaceId NVARCHAR(64),          -- passed as string; converted to the local guid
    @Page        INT,
    @PageSize    INT,
    @FiltersJson NVARCHAR(MAX)  = NULL,
    @SortColumn  NVARCHAR(32)   = N'updated',
    @SortDir     NVARCHAR(4)    = N'desc'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws        UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, @WorkspaceId);
    DECLARE @PageLocal INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size      INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @Filters   NVARCHAR(MAX)    = @FiltersJson;
    DECLARE @Sort      NVARCHAR(32)     = LOWER(ISNULL(@SortColumn, N'updated'));
    DECLARE @Dir       NVARCHAR(4)      = CASE WHEN LOWER(ISNULL(@SortDir, N'desc')) = N'asc' THEN N'asc' ELSE N'desc' END;

    DECLARE @NameContains NVARCHAR(200) = JSON_VALUE(@Filters, N'$.nameContains');
    DECLARE @Search       NVARCHAR(200) = JSON_VALUE(@Filters, N'$.search');

    -- Multi-select funnel filters into temp tables (empty table = filter not applied).
    DECLARE @Kinds       TABLE (v NVARCHAR(20));
    DECLARE @Statuses    TABLE (v NVARCHAR(20));
    DECLARE @Maintainers TABLE (v NVARCHAR(200));

    IF @Filters IS NOT NULL AND ISJSON(@Filters) = 1
    BEGIN
        INSERT INTO @Kinds (v)       SELECT value FROM OPENJSON(@Filters, N'$.kind');
        INSERT INTO @Statuses (v)    SELECT value FROM OPENJSON(@Filters, N'$.status');
        INSERT INTO @Maintainers (v) SELECT value FROM OPENJSON(@Filters, N'$.maintainer');
    END;

    DECLARE @HasKind       BIT = CASE WHEN EXISTS (SELECT 1 FROM @Kinds)       THEN 1 ELSE 0 END;
    DECLARE @HasStatus     BIT = CASE WHEN EXISTS (SELECT 1 FROM @Statuses)    THEN 1 ELSE 0 END;
    DECLARE @HasMaintainer BIT = CASE WHEN EXISTS (SELECT 1 FROM @Maintainers) THEN 1 ELSE 0 END;

    ;WITH Matched AS (
        SELECT t.RecordId, t.Kind, t.Status, t.Name, t.OneLiner, t.Maintainer,
               t.AttachmentBlobPath, t.UpdatedBy, t.UpdatedAt, t.RowVer
        FROM dbo.ToolkitItem AS t
        WHERE t.WorkspaceId = @Ws
          AND t.IsDeleted = 0
          AND (@HasKind = 0       OR t.Kind IN (SELECT v FROM @Kinds))
          AND (@HasStatus = 0     OR t.Status IN (SELECT v FROM @Statuses))
          AND (@HasMaintainer = 0 OR t.Maintainer IN (SELECT v FROM @Maintainers))
          AND (@NameContains IS NULL OR t.Name LIKE N'%' + @NameContains + N'%')
          AND (@Search IS NULL
                OR t.Name LIKE N'%' + @Search + N'%'
                OR t.OneLiner LIKE N'%' + @Search + N'%'
                OR t.Description LIKE N'%' + @Search + N'%'
                OR t.Maintainer LIKE N'%' + @Search + N'%')
    )
    SELECT
        m.RecordId, m.Kind, m.Status, m.Name, m.OneLiner, m.Maintainer,
        CAST(CASE WHEN m.AttachmentBlobPath IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS HasAttachment,
        m.UpdatedBy, m.UpdatedAt, m.RowVer
    FROM Matched AS m
    ORDER BY
        CASE WHEN @Dir = N'asc'  AND @Sort = N'id'         THEN m.RecordId END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'id'         THEN m.RecordId END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'name'       THEN m.Name END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'name'       THEN m.Name END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'type'       THEN m.Kind END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'type'       THEN m.Kind END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'status'     THEN m.Status END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'status'     THEN m.Status END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'maintainer' THEN m.Maintainer END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'maintainer' THEN m.Maintainer END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'updated'    THEN m.UpdatedAt END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'updated'    THEN m.UpdatedAt END DESC,
        m.RecordId ASC   -- stable tiebreak
    OFFSET (@PageLocal - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;

    -- Second result set: total match count for pagination.
    ;WITH MatchedCount AS (
        SELECT t.RecordId
        FROM dbo.ToolkitItem AS t
        WHERE t.WorkspaceId = @Ws
          AND t.IsDeleted = 0
          AND (@HasKind = 0       OR t.Kind IN (SELECT v FROM @Kinds))
          AND (@HasStatus = 0     OR t.Status IN (SELECT v FROM @Statuses))
          AND (@HasMaintainer = 0 OR t.Maintainer IN (SELECT v FROM @Maintainers))
          AND (@NameContains IS NULL OR t.Name LIKE N'%' + @NameContains + N'%')
          AND (@Search IS NULL
                OR t.Name LIKE N'%' + @Search + N'%'
                OR t.OneLiner LIKE N'%' + @Search + N'%'
                OR t.Description LIKE N'%' + @Search + N'%'
                OR t.Maintainer LIKE N'%' + @Search + N'%')
    )
    SELECT COUNT(*) AS TotalCount FROM MatchedCount;
END;
GO
