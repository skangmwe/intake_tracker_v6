-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Returns every stage across a workspace's lifecycles (S31), ordered by
--              lifecycle then track position. The service groups by LifecycleId. Soft-
--              deleted rows excluded.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceStages
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        StageDefinitionId AS StageDefinitionId,
        LifecycleId       AS LifecycleId,
        StageKey          AS StageKey,
        Label             AS Label,
        StatusCategory    AS StatusCategory,
        SortOrder         AS SortOrder
    FROM dbo.StageDefinition
    WHERE WorkspaceId = @WorkspaceIdLocal
      AND IsDeleted = 0
    ORDER BY LifecycleId, SortOrder;
END;
GO
