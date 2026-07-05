-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: Returns the GateDefinition (name + frozen-friendly transition keys/labels) that guards
--              the transition from a record's CURRENT stage to @ToStage on its own lifecycle — or no
--              rows when the transition is ungated. The API calls this before advancing a stage: no
--              row → advance directly (usp_SetRequestStage); one row → open the gate (usp_OpenGate).
--              A gate fires only on its exact from→to edge, so the record's current stage must equal
--              the gate's FromStage. Read-only; the caller has already access-gated the record.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetGateForTransition
    @RecordId    NVARCHAR(20),
    @WorkspaceId UNIQUEIDENTIFIER,
    @ToStage     NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @To     NVARCHAR(64)     = @ToStage;

    DECLARE @LifecycleId  UNIQUEIDENTIFIER;
    DECLARE @CurrentStage NVARCHAR(64);

    SELECT @LifecycleId = LifecycleId, @CurrentStage = Stage
    FROM dbo.Requests
    WHERE RecordId = @Record AND WorkspaceId = @Ws AND IsDeleted = 0;

    IF @LifecycleId IS NULL
        RETURN;

    SELECT
        g.GateDefinitionId,
        g.Name       AS GateName,
        fs.StageKey  AS FromStageKey,
        ts.StageKey  AS ToStageKey,
        fs.Label     AS FromStageLabel,
        ts.Label     AS ToStageLabel
    FROM dbo.GateDefinition AS g
    INNER JOIN dbo.StageDefinition AS fs ON fs.StageDefinitionId = g.FromStageId AND fs.IsDeleted = 0
    INNER JOIN dbo.StageDefinition AS ts ON ts.StageDefinitionId = g.ToStageId AND ts.IsDeleted = 0
    WHERE g.LifecycleId = @LifecycleId
      AND g.IsDeleted = 0
      AND ts.StageKey = @To
      AND fs.StageKey = @CurrentStage;
END;
GO
