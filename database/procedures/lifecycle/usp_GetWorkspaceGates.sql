-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Returns every gate across a workspace's lifecycles (S31). Slots are read by
--              usp_GetWorkspaceGateSlots and joined in the service. Soft-deleted rows
--              excluded.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceGates
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        GateDefinitionId AS GateDefinitionId,
        LifecycleId      AS LifecycleId,
        Name             AS Name,
        FromStageId      AS FromStageId,
        ToStageId        AS ToStageId,
        JoinKind         AS JoinKind,
        SortOrder        AS SortOrder
    FROM dbo.GateDefinition
    WHERE WorkspaceId = @WorkspaceIdLocal
      AND IsDeleted = 0
    ORDER BY LifecycleId, SortOrder;
END;
GO
