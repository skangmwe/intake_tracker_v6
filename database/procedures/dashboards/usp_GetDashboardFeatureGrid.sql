-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — the records grid under the Feature Catalog dashboard (S12).
--              Mirrors usp_GetDashboardRecordsGrid's two-result-set shape for Published features:
--                (1) up to @Top rows: Id, Name, FeatureType, Tech, Owner, Maturity;
--                (2) TotalCount — the full match count.
--              Tech joins the multi-value techStack array into a single comma-separated label
--              (truncated to 128). Owner is the persisted $.owner projection; FeatureType the
--              persisted $.featureType projection. Published (Maturity = 'Published') only — the
--              catalog surfaces reusable, shipped features. Scoped to @WorkspaceId AND
--              IsDeleted = 0; access enforced API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardFeatureGrid
    @WorkspaceId UNIQUEIDENTIFIER,
    @Top         INT = 50
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws       UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @TopLocal INT = CASE WHEN @Top IS NULL OR @Top < 1 THEN 50 WHEN @Top > 500 THEN 500 ELSE @Top END;

    -- Result set 1: the page (Published features, TOP @Top by name).
    SELECT TOP (@TopLocal)
        CAST(f.RecordId AS NVARCHAR(64))         AS Id,
        f.Name                                   AS Name,
        CAST(f.FeatureType AS NVARCHAR(64))      AS FeatureType,
        LEFT(
            (SELECT STRING_AGG(CAST(tech.value AS NVARCHAR(128)), N', ')
             FROM OPENJSON(
                    CASE WHEN ISJSON(JSON_QUERY(f.FieldValues, N'$.techStack')) = 1
                         THEN JSON_QUERY(f.FieldValues, N'$.techStack')
                         ELSE N'[]'
                    END) AS tech
             WHERE tech.value IS NOT NULL AND tech.value <> N''),
            128)                                 AS Tech,
        CAST(f.OwnerUserId AS NVARCHAR(200))     AS Owner,
        CAST(f.Maturity AS NVARCHAR(32))         AS Maturity
    FROM dbo.Features AS f
    WHERE f.WorkspaceId = @Ws
      AND f.IsDeleted = 0
      AND f.Maturity = N'Published'
    ORDER BY f.Name ASC, f.RecordId ASC;

    -- Result set 2: total match count.
    SELECT COUNT(*) AS TotalCount
    FROM dbo.Features AS f
    WHERE f.WorkspaceId = @Ws
      AND f.IsDeleted = 0
      AND f.Maturity = N'Published';
END;
GO
