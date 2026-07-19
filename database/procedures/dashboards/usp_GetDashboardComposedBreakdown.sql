-- =============================================
-- Author:      /dev-build-application (Slice 28 — Multi-dashboard composer)
-- Create Date: 2026-07-19
-- Description: Composed-widget resolver — a group-by breakdown over the scoped OPEN requests (S6
--              composer "Breakdown bars" and "Pipeline segments" widgets; both read this proc, the
--              API shapes bar-percent-of-max vs segment-percent-of-total). Serves user-composed
--              dashboards only.
--                • @GroupBy     — 'origin' | 'stage' | 'analyst' | 'priority'.
--                • @DeptsJson   — JSON array of Dept/PG/Client labels; empty/NULL = every dept.
--                • @StagesJson  — JSON array of stage KEYS; empty/NULL = every stage.
--              origin → Dept/PG/Client ('— (unset)' for blank); stage → StageDefinition label
--              (falls back to the stage key); analyst → assigned analyst ('Unassigned' for blank);
--              priority → 'P{score}'. Open = no $.outcome. Scoped to @WorkspaceId AND IsDeleted = 0;
--              access enforced API-side. Returns (Label, Cnt) ordered by count desc, label asc.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardComposedBreakdown
    @WorkspaceId UNIQUEIDENTIFIER,
    @GroupBy     NVARCHAR(20),
    @DeptsJson   NVARCHAR(MAX) = NULL,
    @StagesJson  NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws         UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Group      NVARCHAR(20)     = @GroupBy;
    DECLARE @Depts      NVARCHAR(MAX)    = CASE WHEN @DeptsJson  IS NOT NULL AND ISJSON(@DeptsJson)  = 1 THEN @DeptsJson  ELSE NULL END;
    DECLARE @Stages     NVARCHAR(MAX)    = CASE WHEN @StagesJson IS NOT NULL AND ISJSON(@StagesJson) = 1 THEN @StagesJson ELSE NULL END;
    DECLARE @DeptCount  INT              = CASE WHEN @Depts  IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM OPENJSON(@Depts))  END;
    DECLARE @StageCount INT              = CASE WHEN @Stages IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM OPENJSON(@Stages)) END;

    ;WITH Scoped AS (
        SELECT
            COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)')                            AS OriginLabel,
            COALESCE(sd.Label, r.Stage)                                                    AS StageLabel,
            CASE WHEN r.AssignedAnalyst IS NULL OR r.AssignedAnalyst IN (N'', N'—')
                 THEN N'Unassigned' ELSE r.AssignedAnalyst END                            AS AnalystLabel,
            N'P' + CAST(COALESCE(r.PriorityScore, 0) AS NVARCHAR(10))                      AS PriorityLabel
        FROM dbo.Requests AS r
        LEFT JOIN dbo.StageDefinition AS sd
            ON sd.LifecycleId = r.LifecycleId
           AND sd.StageKey = r.Stage
           AND sd.IsDeleted = 0
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
          AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
          AND (@DeptCount = 0
               OR COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)') IN (SELECT value FROM OPENJSON(@Depts)))
          AND (@StageCount = 0
               OR r.Stage IN (SELECT value FROM OPENJSON(@Stages)))
    )
    SELECT
        Label,
        COUNT(*) AS Cnt
    FROM (
        SELECT
            CASE @Group
                WHEN N'origin'   THEN OriginLabel
                WHEN N'stage'    THEN StageLabel
                WHEN N'analyst'  THEN AnalystLabel
                WHEN N'priority' THEN PriorityLabel
                ELSE OriginLabel
            END AS Label
        FROM Scoped
    ) AS grouped
    GROUP BY Label
    ORDER BY Cnt DESC, Label ASC;
END;
GO
