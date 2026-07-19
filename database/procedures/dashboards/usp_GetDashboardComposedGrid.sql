-- =============================================
-- Author:      /dev-build-application (Slice 28 — Multi-dashboard composer)
-- Create Date: 2026-07-19
-- Description: Composed-widget resolver — the records table under a composed dashboard (S6 composer
--              "Records table" widget). Serves user-composed dashboards only; unlike the seeded
--              usp_GetDashboardRecordsGrid it takes a dept + stage scope (no drill-through) and a
--              small @Top row cap. Returns TWO result sets:
--                (1) up to @Top page rows: Id, Name, Stage, Origin, Analyst, Priority, Due,
--                    StatusCategory, Closed (always 0 — composed grids show open records only);
--                (2) TotalCount — the full match count.
--                • @DeptsJson  — JSON array of Dept/PG/Client labels; empty/NULL = every dept.
--                • @StagesJson — JSON array of stage KEYS; empty/NULL = every stage.
--              Open = no $.outcome in FieldValues. Origin from Dept/PG/Client ('— (unset)' when
--              blank); Stage/StatusCategory via StageDefinition (LifecycleId + StageKey). Scoped to
--              @WorkspaceId AND IsDeleted = 0; access enforced API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardComposedGrid
    @WorkspaceId UNIQUEIDENTIFIER,
    @DeptsJson   NVARCHAR(MAX) = NULL,
    @StagesJson  NVARCHAR(MAX) = NULL,
    @Top         INT           = 6
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws         UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @TopLocal   INT              = CASE WHEN @Top IS NULL OR @Top < 1 THEN 6 WHEN @Top > 100 THEN 100 ELSE @Top END;
    DECLARE @Depts      NVARCHAR(MAX)    = CASE WHEN @DeptsJson  IS NOT NULL AND ISJSON(@DeptsJson)  = 1 THEN @DeptsJson  ELSE NULL END;
    DECLARE @Stages     NVARCHAR(MAX)    = CASE WHEN @StagesJson IS NOT NULL AND ISJSON(@StagesJson) = 1 THEN @StagesJson ELSE NULL END;
    DECLARE @DeptCount  INT              = CASE WHEN @Depts  IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM OPENJSON(@Depts))  END;
    DECLARE @StageCount INT              = CASE WHEN @Stages IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM OPENJSON(@Stages)) END;

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

    INSERT INTO #Filtered (Id, Name, Stage, Origin, Analyst, Priority, Due, StatusCategory, Closed)
    SELECT
        CAST(r.RecordId AS NVARCHAR(64)),
        r.Name,
        LEFT(COALESCE(sd.Label, r.Stage), 64),
        COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)'),
        CASE WHEN r.AssignedAnalyst IN (N'', N'—') THEN NULL ELSE r.AssignedAnalyst END,
        r.PriorityScore,
        r.DueDate,
        sd.StatusCategory,
        CAST(0 AS BIT)
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
           OR r.Stage IN (SELECT value FROM OPENJSON(@Stages)));

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
