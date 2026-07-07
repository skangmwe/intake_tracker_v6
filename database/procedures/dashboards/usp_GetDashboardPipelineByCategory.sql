-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — open requests grouped by StatusCategory (S6 "Inflight status").
--              Category comes from StageDefinition (joined by the record's LifecycleId + current
--              StageKey), the authoritative stage→bucket mapping (§10.6). "Open" = the record
--              carries no closure outcome (usp_CloseRequest writes $.outcome into FieldValues).
--              Scoped WorkspaceId = @WorkspaceId AND IsDeleted = 0; access is enforced API-side.
--              Emits one row per category present; the API pads to the fixed order
--              Intake, Build, Review, Deploy.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardPipelineByCategory
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        sd.StatusCategory AS Category,
        COUNT(*)          AS Cnt
    FROM dbo.Requests AS r
    INNER JOIN dbo.StageDefinition AS sd
        ON sd.LifecycleId = r.LifecycleId
       AND sd.StageKey = r.Stage
       AND sd.IsDeleted = 0
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
    GROUP BY sd.StatusCategory;
END;
GO
