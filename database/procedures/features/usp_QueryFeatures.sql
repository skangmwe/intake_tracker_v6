-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: The Feature Catalog list read (S9). Returns a page of rows for the AI Solutions
--              workspace plus the total match count. Workspace membership is verified API-side by
--              the access guard before this runs, so the proc trusts @WorkspaceId scope; every
--              filter value is parameterised (via OPENJSON of @FiltersJson — never string-built)
--              per api-data-access.md. Sorting is column-whitelisted. Pagination via OFFSET/FETCH.
--
--              @FiltersJson (all keys optional):
--                { "maturity": ["Published",..], "featureType": ["integration",..],
--                  "techStack": ["Python",..], "capabilityTags": ["OCR",..],
--                  "nameContains": "summar" }
--              techStack / capabilityTags match ANY (a feature matches if it carries any of the
--              requested values). @SortColumn ∈ {id,name,type,maturity,updated}; @SortDir ∈ {asc,desc}.
--              Two result sets: (1) the page rows, (2) a single-column TotalCount.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryFeatures
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
    DECLARE @Size      INT = CASE WHEN @PageSize < 1 THEN 25 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @Filters   NVARCHAR(MAX)    = @FiltersJson;
    DECLARE @Sort      NVARCHAR(32)     = LOWER(ISNULL(@SortColumn, N'updated'));
    DECLARE @Dir       NVARCHAR(4)      = CASE WHEN LOWER(ISNULL(@SortDir, N'desc')) = N'asc' THEN N'asc' ELSE N'desc' END;

    DECLARE @NameContains NVARCHAR(400) = JSON_VALUE(@Filters, N'$.nameContains');

    -- Multi-select filters into temp tables (empty table = filter not applied).
    DECLARE @Maturities TABLE (v NVARCHAR(16));
    DECLARE @Types      TABLE (v NVARCHAR(32));
    DECLARE @Tech       TABLE (v NVARCHAR(128));
    DECLARE @Tags       TABLE (v NVARCHAR(128));

    IF @Filters IS NOT NULL AND ISJSON(@Filters) = 1
    BEGIN
        INSERT INTO @Maturities (v) SELECT value FROM OPENJSON(@Filters, N'$.maturity');
        INSERT INTO @Types (v)      SELECT value FROM OPENJSON(@Filters, N'$.featureType');
        INSERT INTO @Tech (v)       SELECT value FROM OPENJSON(@Filters, N'$.techStack');
        INSERT INTO @Tags (v)       SELECT value FROM OPENJSON(@Filters, N'$.capabilityTags');
    END;

    DECLARE @HasMaturity BIT = CASE WHEN EXISTS (SELECT 1 FROM @Maturities) THEN 1 ELSE 0 END;
    DECLARE @HasType     BIT = CASE WHEN EXISTS (SELECT 1 FROM @Types)      THEN 1 ELSE 0 END;
    DECLARE @HasTech     BIT = CASE WHEN EXISTS (SELECT 1 FROM @Tech)       THEN 1 ELSE 0 END;
    DECLARE @HasTags     BIT = CASE WHEN EXISTS (SELECT 1 FROM @Tags)       THEN 1 ELSE 0 END;

    ;WITH Matched AS (
        SELECT f.RecordId, f.Name, f.Maturity, f.OneLiner, f.FeatureType, f.OwnerUserId,
               f.Origin, f.FieldValues, f.UpdatedAt, f.RowVer
        FROM dbo.Features AS f
        WHERE f.WorkspaceId = @Ws
          AND f.IsDeleted = 0
          AND (@HasMaturity = 0 OR f.Maturity IN (SELECT v FROM @Maturities))
          AND (@HasType = 0     OR f.FeatureType IN (SELECT v FROM @Types))
          AND (@NameContains IS NULL
                OR f.Name LIKE N'%' + @NameContains + N'%'
                OR f.OneLiner LIKE N'%' + @NameContains + N'%')
          AND (@HasTech = 0 OR EXISTS (
                SELECT 1 FROM OPENJSON(f.FieldValues, N'$.techStack') AS tk
                WHERE tk.value IN (SELECT v FROM @Tech)))
          AND (@HasTags = 0 OR EXISTS (
                SELECT 1 FROM OPENJSON(f.FieldValues, N'$.capabilityTags') AS tg
                WHERE tg.value IN (SELECT v FROM @Tags)))
    )
    SELECT
        m.RecordId, m.Name, m.Maturity, m.OneLiner, m.FeatureType, m.OwnerUserId,
        m.Origin, m.FieldValues, m.UpdatedAt, m.RowVer
    FROM Matched AS m
    ORDER BY
        CASE WHEN @Dir = N'asc'  AND @Sort = N'id'       THEN m.RecordId END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'id'       THEN m.RecordId END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'name'     THEN m.Name END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'name'     THEN m.Name END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'type'     THEN m.FeatureType END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'type'     THEN m.FeatureType END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'maturity' THEN m.Maturity END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'maturity' THEN m.Maturity END DESC,
        CASE WHEN @Dir = N'asc'  AND @Sort = N'updated'  THEN m.UpdatedAt END ASC,
        CASE WHEN @Dir = N'desc' AND @Sort = N'updated'  THEN m.UpdatedAt END DESC,
        m.RecordId ASC   -- stable tiebreak
    OFFSET (@PageLocal - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;

    -- Second result set: total match count for pagination.
    ;WITH MatchedCount AS (
        SELECT f.RecordId
        FROM dbo.Features AS f
        WHERE f.WorkspaceId = @Ws
          AND f.IsDeleted = 0
          AND (@HasMaturity = 0 OR f.Maturity IN (SELECT v FROM @Maturities))
          AND (@HasType = 0     OR f.FeatureType IN (SELECT v FROM @Types))
          AND (@NameContains IS NULL
                OR f.Name LIKE N'%' + @NameContains + N'%'
                OR f.OneLiner LIKE N'%' + @NameContains + N'%')
          AND (@HasTech = 0 OR EXISTS (
                SELECT 1 FROM OPENJSON(f.FieldValues, N'$.techStack') AS tk
                WHERE tk.value IN (SELECT v FROM @Tech)))
          AND (@HasTags = 0 OR EXISTS (
                SELECT 1 FROM OPENJSON(f.FieldValues, N'$.capabilityTags') AS tg
                WHERE tg.value IN (SELECT v FROM @Tags)))
    )
    SELECT COUNT(*) AS TotalCount FROM MatchedCount;
END;
GO
