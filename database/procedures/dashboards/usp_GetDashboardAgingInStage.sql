-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — open requests bucketed by days in their current stage (S14
--              "Aging in stage" histogram). Days = DATEDIFF(day, StageEnteredAt, now), falling
--              back to CreatedAt when StageEnteredAt is unknown (legacy rows). Buckets:
--              0–2 (1), 3–7 (2), 8–14 (3), 15–30 (4), 30+ (5) — 30 falls in 15–30, >30 in 30+.
--              "Open" = no closure outcome. One row per bucket present, ordered by SortOrder.
--              Scoped to @WorkspaceId AND IsDeleted = 0; access enforced API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardAgingInStage
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws  UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    ;WITH Aged AS (
        SELECT
            DATEDIFF(DAY, COALESCE(r.StageEnteredAt, r.CreatedAt), @Now) AS DaysInStage
        FROM dbo.Requests AS r
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
          AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
    ),
    Bucketed AS (
        SELECT
            CASE
                WHEN DaysInStage <= 2  THEN N'0–2'
                WHEN DaysInStage <= 7  THEN N'3–7'
                WHEN DaysInStage <= 14 THEN N'8–14'
                WHEN DaysInStage <= 30 THEN N'15–30'
                ELSE N'30+'
            END AS Bucket,
            CASE
                WHEN DaysInStage <= 2  THEN 1
                WHEN DaysInStage <= 7  THEN 2
                WHEN DaysInStage <= 14 THEN 3
                WHEN DaysInStage <= 30 THEN 4
                ELSE 5
            END AS SortOrder
        FROM Aged
    )
    SELECT
        Bucket,
        SortOrder,
        COUNT(*) AS Cnt
    FROM Bucketed
    GROUP BY Bucket, SortOrder
    ORDER BY SortOrder ASC;
END;
GO
