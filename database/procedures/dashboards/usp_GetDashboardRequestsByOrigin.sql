-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — all non-deleted requests grouped by Origin (S15 "Requests by
--              Dept/PG/Client" on the PG starter dashboard). Origin from Dept/PG/Client;
--              NULL/'' → '— (unset)'. Counts open AND closed records (a full-of-record breakdown,
--              not an in-flight view). One row per origin present, ordered by count descending.
--              Scoped to @WorkspaceId AND IsDeleted = 0; access enforced API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardRequestsByOrigin
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)') AS Origin,
        COUNT(*)                                            AS Cnt
    FROM dbo.Requests AS r
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
    GROUP BY COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)')
    ORDER BY Cnt DESC, Origin ASC;
END;
GO
