-- =============================================
-- Author:      /dev-build-application (Slice 28 — Multi-dashboard composer)
-- Create Date: 2026-07-19
-- Description: Composed-widget resolver — a single KPI value over the scoped OPEN requests (S6
--              composer, "Metric (KPI)" widget). Unlike the seeded fixed resolvers, this serves
--              user-composed dashboards: the metric is one of the composer's generic aggregates
--              and the scope is a dept + stage filter.
--                • @Metric      — 'count' | 'unassigned' | 'overdue' | 'high-priority'.
--                • @DeptsJson   — JSON array of Dept/PG/Client labels ('— (unset)' for blank);
--                                 empty/NULL = every department.
--                • @StagesJson  — JSON array of stage KEYS; empty/NULL = every stage.
--                • @Today       — reference date for 'overdue' (defaults to today, UTC).
--              Open = no $.outcome in FieldValues. Scoped to @WorkspaceId AND IsDeleted = 0; access
--              enforced API-side. Returns one row (Cnt).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardComposedKpi
    @WorkspaceId UNIQUEIDENTIFIER,
    @Metric      NVARCHAR(20),
    @DeptsJson   NVARCHAR(MAX) = NULL,
    @StagesJson  NVARCHAR(MAX) = NULL,
    @Today       DATE          = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws         UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @M          NVARCHAR(20)     = @Metric;
    DECLARE @Depts      NVARCHAR(MAX)    = CASE WHEN @DeptsJson  IS NOT NULL AND ISJSON(@DeptsJson)  = 1 THEN @DeptsJson  ELSE NULL END;
    DECLARE @Stages     NVARCHAR(MAX)    = CASE WHEN @StagesJson IS NOT NULL AND ISJSON(@StagesJson) = 1 THEN @StagesJson ELSE NULL END;
    DECLARE @TodayLocal DATE             = COALESCE(@Today, CAST(SYSUTCDATETIME() AS DATE));
    DECLARE @DeptCount  INT              = CASE WHEN @Depts  IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM OPENJSON(@Depts))  END;
    DECLARE @StageCount INT              = CASE WHEN @Stages IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM OPENJSON(@Stages)) END;

    SELECT COUNT(*) AS Cnt
    FROM dbo.Requests AS r
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
      AND (@DeptCount = 0
           OR COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)') IN (SELECT value FROM OPENJSON(@Depts)))
      AND (@StageCount = 0
           OR r.Stage IN (SELECT value FROM OPENJSON(@Stages)))
      AND (
            @M = N'count'
            OR (@M = N'unassigned'    AND (r.AssignedAnalyst IS NULL OR r.AssignedAnalyst IN (N'', N'—')))
            OR (@M = N'overdue'       AND r.DueDate IS NOT NULL AND r.DueDate < @TodayLocal)
            OR (@M = N'high-priority' AND r.PriorityScore >= 5)
          );
END;
GO
