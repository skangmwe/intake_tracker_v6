-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — open requests per assigned analyst (S14 "Open records per
--              analyst"). "Open" = no closure outcome in FieldValues; only records with a
--              non-empty AssignedAnalyst (not NULL, not '', not the em-dash placeholder '—') are
--              counted. Grouped by analyst, ordered by count descending. Scoped to @WorkspaceId
--              AND IsDeleted = 0; access enforced API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardOpenPerAnalyst
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        r.AssignedAnalyst AS Analyst,
        COUNT(*)          AS Cnt
    FROM dbo.Requests AS r
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
      AND r.AssignedAnalyst IS NOT NULL
      AND r.AssignedAnalyst <> N''
      AND r.AssignedAnalyst <> N'—'
    GROUP BY r.AssignedAnalyst
    ORDER BY Cnt DESC, Analyst ASC;
END;
GO
