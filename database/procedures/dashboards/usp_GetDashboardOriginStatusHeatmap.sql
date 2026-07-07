-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — the Origin × status heatmap (S6 "Requests by Dept/PG/Client ×
--              status"). Emits one row per (Origin, ColKey) cell with its count. Open records
--              contribute a cell under their StatusCategory (ColKey ∈ Intake, Build, Review,
--              Deploy); closed records contribute a cell under their Outcome (ColKey ∈ Live,
--              Declined, Withdrawn, Duplicate). Origin from Dept/PG/Client; NULL/'' → '— (unset)'.
--              The API pivots to the fixed 8 columns and the distinct origins present ('— (unset)'
--              always last). Scoped to @WorkspaceId AND IsDeleted = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardOriginStatusHeatmap
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    -- Open cells: grouped by category.
    SELECT
        COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)') AS Origin,
        sd.StatusCategory                                   AS ColKey,
        COUNT(*)                                            AS Cnt
    FROM dbo.Requests AS r
    INNER JOIN dbo.StageDefinition AS sd
        ON sd.LifecycleId = r.LifecycleId
       AND sd.StageKey = r.Stage
       AND sd.IsDeleted = 0
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
    GROUP BY COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)'), sd.StatusCategory

    UNION ALL

    -- Closed cells: grouped by outcome.
    SELECT
        COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)')          AS Origin,
        CAST(JSON_VALUE(r.FieldValues, N'$.outcome') AS NVARCHAR(32)) AS ColKey,
        COUNT(*)                                                      AS Cnt
    FROM dbo.Requests AS r
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NOT NULL
    GROUP BY COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)'),
             CAST(JSON_VALUE(r.FieldValues, N'$.outcome') AS NVARCHAR(32));
END;
GO
