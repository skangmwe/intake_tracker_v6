-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — count of published features (S12 "Published features" tile).
--              Maturity = 'Published' (dbo.Features, slice 14). Single-row result (Cnt). Scoped to
--              @WorkspaceId AND IsDeleted = 0; access enforced API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardFeaturesPublished
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT COUNT(*) AS Cnt
    FROM dbo.Features AS f
    WHERE f.WorkspaceId = @Ws
      AND f.IsDeleted = 0
      AND f.Maturity = N'Published';
END;
GO
