-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — published features grouped by feature type (S12 "Features by
--              type"). FeatureType is a persisted projection of $.featureType on dbo.Features;
--              blank/NULL → '— (unset)'. Published (Maturity = 'Published') only. One row per type
--              present, ordered by count descending. Scoped to @WorkspaceId AND IsDeleted = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardFeaturesByType
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        COALESCE(NULLIF(f.FeatureType, N''), N'— (unset)') AS TypeLabel,
        COUNT(*)                                           AS Cnt
    FROM dbo.Features AS f
    WHERE f.WorkspaceId = @Ws
      AND f.IsDeleted = 0
      AND f.Maturity = N'Published'
    GROUP BY COALESCE(NULLIF(f.FeatureType, N''), N'— (unset)')
    ORDER BY Cnt DESC, TypeLabel ASC;
END;
GO
