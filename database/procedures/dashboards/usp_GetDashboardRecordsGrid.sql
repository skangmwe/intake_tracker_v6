-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — the records grid under a Request dashboard (S6/S14/S15), with
--              live drill-through. Returns TWO result sets:
--                (1) up to @Top page rows: Id, Name, Stage, Origin, Analyst, Priority, Due,
--                    StatusCategory, Closed;
--                (2) TotalCount — the full match count (not just the page).
--              The drill filter is parsed from @DrillJson (server-side, parameterised — never
--              string-built). Supported drill types and their fields:
--                • (no drill)   → open records only.
--                • origin       → open records with Dept/PG/Client = value|origin.
--                • category     → open records whose StatusCategory = value|category.
--                • unassigned   → open, past-Intake, unassigned records.
--                • cell         → open records with origin AND category (heatmap in-flight cell).
--                • outcome      → closed records with Outcome = value|outcome.
--                • closedCell   → closed records with origin AND outcome (heatmap closed cell).
--              Open = no $.outcome in FieldValues. Closed rows render Stage = 'Closed · '+Outcome,
--              Closed = 1 (the UI does not open them). Origin from Dept/PG/Client ('— (unset)' when
--              blank). Category via StageDefinition (LifecycleId + StageKey). Scoped to
--              @WorkspaceId AND IsDeleted = 0; access enforced API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardRecordsGrid
    @WorkspaceId UNIQUEIDENTIFIER,
    @DrillJson   NVARCHAR(MAX) = NULL,
    @Top         INT = 50
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws       UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @TopLocal INT = CASE WHEN @Top IS NULL OR @Top < 1 THEN 50 WHEN @Top > 500 THEN 500 ELSE @Top END;
    DECLARE @Drill    NVARCHAR(MAX) = CASE WHEN @DrillJson IS NOT NULL AND ISJSON(@DrillJson) = 1 THEN @DrillJson ELSE NULL END;

    DECLARE @DrillType NVARCHAR(32)  = JSON_VALUE(@Drill, N'$.type');
    DECLARE @DValue    NVARCHAR(200) = JSON_VALUE(@Drill, N'$.value');
    DECLARE @DOrigin   NVARCHAR(200) = COALESCE(JSON_VALUE(@Drill, N'$.origin'),   JSON_VALUE(@Drill, N'$.value'));
    DECLARE @DCategory NVARCHAR(16)  = COALESCE(JSON_VALUE(@Drill, N'$.category'), JSON_VALUE(@Drill, N'$.value'));
    DECLARE @DOutcome  NVARCHAR(32)  = COALESCE(JSON_VALUE(@Drill, N'$.outcome'),  JSON_VALUE(@Drill, N'$.value'));

    CREATE TABLE #Filtered
    (
        Id             NVARCHAR(64)  NOT NULL,
        Name           NVARCHAR(400) NULL,
        Stage          NVARCHAR(64)  NULL,
        Origin         NVARCHAR(200) NULL,
        Analyst        NVARCHAR(200) NULL,
        Priority       INT           NULL,
        Due            DATE          NULL,
        StatusCategory NVARCHAR(16)  NULL,
        Closed         BIT           NOT NULL
    );

    ;WITH Base AS (
        SELECT
            CAST(r.RecordId AS NVARCHAR(64))                              AS Id,
            r.Name                                                        AS Name,
            r.Stage                                                       AS StageKey,
            sd.Label                                                      AS StageLabel,
            sd.StatusCategory                                             AS StatusCategory,
            COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)')           AS OriginLabel,
            CASE WHEN r.AssignedAnalyst IN (N'', N'—') THEN NULL ELSE r.AssignedAnalyst END AS Analyst,
            r.PriorityScore                                               AS Priority,
            r.DueDate                                                     AS Due,
            CAST(JSON_VALUE(r.FieldValues, N'$.outcome') AS NVARCHAR(32)) AS OutcomeVal
        FROM dbo.Requests AS r
        LEFT JOIN dbo.StageDefinition AS sd
            ON sd.LifecycleId = r.LifecycleId
           AND sd.StageKey = r.Stage
           AND sd.IsDeleted = 0
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
    )
    INSERT INTO #Filtered (Id, Name, Stage, Origin, Analyst, Priority, Due, StatusCategory, Closed)
    SELECT
        b.Id,
        b.Name,
        LEFT(CASE WHEN b.OutcomeVal IS NOT NULL THEN N'Closed · ' + b.OutcomeVal
                  ELSE COALESCE(b.StageLabel, b.StageKey) END, 64),
        b.OriginLabel,
        b.Analyst,
        b.Priority,
        b.Due,
        b.StatusCategory,
        CASE WHEN b.OutcomeVal IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
    FROM Base AS b
    WHERE
        (@DrillType IS NULL AND b.OutcomeVal IS NULL)
        OR (@DrillType = N'origin'   AND b.OutcomeVal IS NULL AND b.OriginLabel = @DOrigin)
        OR (@DrillType = N'category' AND b.OutcomeVal IS NULL AND b.StatusCategory = @DCategory)
        OR (@DrillType = N'unassigned' AND b.OutcomeVal IS NULL AND b.StatusCategory <> N'Intake' AND b.Analyst IS NULL)
        OR (@DrillType = N'cell'     AND b.OutcomeVal IS NULL AND b.OriginLabel = @DOrigin AND b.StatusCategory = @DCategory)
        OR (@DrillType = N'outcome'  AND b.OutcomeVal IS NOT NULL AND b.OutcomeVal = @DOutcome)
        OR (@DrillType = N'closedCell' AND b.OutcomeVal IS NOT NULL AND b.OutcomeVal = @DOutcome AND b.OriginLabel = @DOrigin);

    -- Result set 1: the page (TOP @Top by priority, stable tiebreak on Id).
    SELECT TOP (@TopLocal)
        f.Id, f.Name, f.Stage, f.Origin, f.Analyst, f.Priority, f.Due, f.StatusCategory, f.Closed
    FROM #Filtered AS f
    ORDER BY f.Priority DESC, f.Id ASC;

    -- Result set 2: total match count.
    SELECT COUNT(*) AS TotalCount FROM #Filtered;

    DROP TABLE #Filtered;
END;
GO
