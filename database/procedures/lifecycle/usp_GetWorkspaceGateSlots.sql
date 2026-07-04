-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Returns every gate's approver slots for a workspace (S31), with the LIVE
--              eligible-member count for each slot's role label (COUNT of active
--              ApproverTeamMembership rows in the workspace). The count is computed at read
--              time — never stored — so it always reflects the current roster. Soft-deleted
--              rows excluded.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceGateSlots
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        slot.GateDefinitionId AS GateDefinitionId,
        slot.RoleLabel        AS RoleLabel,
        slot.SlotIndex        AS SlotIndex,
        (
            SELECT COUNT(*)
            FROM dbo.ApproverTeamMembership AS member
            WHERE member.WorkspaceId = @WorkspaceIdLocal
              AND member.RoleLabel = slot.RoleLabel
              AND member.IsDeleted = 0
        ) AS EligibleCount
    FROM dbo.GateApproverSlot AS slot
    INNER JOIN dbo.GateDefinition AS gate
        ON gate.GateDefinitionId = slot.GateDefinitionId
       AND gate.IsDeleted = 0
    WHERE gate.WorkspaceId = @WorkspaceIdLocal
      AND slot.IsDeleted = 0
    ORDER BY slot.GateDefinitionId, slot.SlotIndex;
END;
GO
