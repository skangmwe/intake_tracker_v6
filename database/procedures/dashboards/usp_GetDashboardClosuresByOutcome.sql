-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — requests closed this quarter grouped by Outcome (S6 "Closures
--              this quarter"). A record is closed when $.outcome is set in FieldValues
--              (usp_CloseRequest, slice 10). Outcome ∈ Live | Declined | Withdrawn | Duplicate |
--              NotPursued; the API pads Live/Declined/Withdrawn/Duplicate to 0.
--
--              APPROXIMATION (documented per contract): there is no dedicated ClosedAt column —
--              closure writes the outcome into FieldValues and bumps UpdatedAt. "Closed this
--              quarter" is therefore taken as a closed record whose UpdatedAt falls in the current
--              calendar quarter (the best available closure-time proxy; a later edit to a closed
--              record would move it). Scoped to @WorkspaceId AND IsDeleted = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardClosuresByOutcome
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Now    DATETIME2 = SYSUTCDATETIME();
    DECLARE @QStart DATE = DATEFROMPARTS(YEAR(@Now), ((DATEPART(QUARTER, @Now) - 1) * 3) + 1, 1);
    DECLARE @QEnd   DATE = DATEADD(QUARTER, 1, @QStart);   -- exclusive upper bound

    SELECT
        CAST(JSON_VALUE(r.FieldValues, N'$.outcome') AS NVARCHAR(32)) AS Outcome,
        COUNT(*)                                                      AS Cnt
    FROM dbo.Requests AS r
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NOT NULL
      AND r.UpdatedAt >= @QStart
      AND r.UpdatedAt < @QEnd
    GROUP BY CAST(JSON_VALUE(r.FieldValues, N'$.outcome') AS NVARCHAR(32))
    ORDER BY Cnt DESC, Outcome ASC;
END;
GO
