-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — published features grouped by tech / stack (S12 "Features by
--              tech / stack"). techStack is a MultiSelect field stored as a JSON array in
--              FieldValues ($.techStack); each element is counted separately (a feature on two
--              stacks contributes to both). Only well-formed arrays are split; a feature with no
--              tech contributes no rows. Published (Maturity = 'Published') only. One row per tech
--              value present, ordered by count descending. Scoped to @WorkspaceId AND
--              IsDeleted = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardFeaturesByTech
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        CAST(tech.value AS NVARCHAR(128)) AS TechLabel,
        COUNT(*)                          AS Cnt
    FROM dbo.Features AS f
    CROSS APPLY OPENJSON(
        CASE WHEN ISJSON(JSON_QUERY(f.FieldValues, N'$.techStack')) = 1
             THEN JSON_QUERY(f.FieldValues, N'$.techStack')
             ELSE N'[]'
        END) AS tech
    WHERE f.WorkspaceId = @Ws
      AND f.IsDeleted = 0
      AND f.Maturity = N'Published'
      AND tech.value IS NOT NULL
      AND tech.value <> N''
    GROUP BY CAST(tech.value AS NVARCHAR(128))
    ORDER BY Cnt DESC, TechLabel ASC;
END;
GO
