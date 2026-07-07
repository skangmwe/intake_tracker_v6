-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — open, past-Intake, unassigned requests grouped by Origin
--              (S6 "Unassigned past Intake" tile + per-origin chips). "Open" = no closure outcome;
--              "past Intake" = the record's StatusCategory <> 'Intake'; "unassigned" =
--              AssignedAnalyst is NULL, empty, or the em-dash placeholder '—'. Origin from
--              Dept/PG/Client ('— (unset)' when blank). Scoped to @WorkspaceId AND IsDeleted = 0;
--              access enforced API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardUnassigned
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
    INNER JOIN dbo.StageDefinition AS sd
        ON sd.LifecycleId = r.LifecycleId
       AND sd.StageKey = r.Stage
       AND sd.IsDeleted = 0
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
      AND sd.StatusCategory <> N'Intake'
      AND (r.AssignedAnalyst IS NULL OR r.AssignedAnalyst = N'' OR r.AssignedAnalyst = N'—')
    GROUP BY COALESCE(NULLIF(r.DeptPgClient, N''), N'— (unset)')
    ORDER BY Cnt DESC, Origin ASC;
END;
GO
