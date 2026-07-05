-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: Returns the gates (ApprovalRequests) on a record that @UserId is entitled to see —
--              access is baked into the query via a JOIN to WorkspaceMembership (api-record-access.md).
--              A record the caller cannot see, or one with no gates, both return zero rows; the API
--              first gates the parent record (usp_GetRequestByIdForUser → null → 403), so an
--              accessible record with no gates returns an empty list (200), not 403. Open gates render
--              inline within their target phase on the Tasks & gates tab; resolved gates collapse to a
--              "Resolved" chip. Ordered newest-open first. Read-only projection via
--              vw_ApprovalRequestDetail.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetApprovalRequestsForRecord
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;

    SELECT
        v.ApprovalRequestId, v.RequestRecordId, v.WorkspaceId, v.GateDefinitionId, v.GateName,
        v.FromStageKey, v.ToStageKey, v.FromStageLabel, v.ToStageLabel, v.State,
        v.OpenedAt, v.ResolvedAt, v.FrozenApproverSet, v.DecisionsJson
    FROM dbo.vw_ApprovalRequestDetail AS v
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = v.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
    WHERE v.RequestRecordId = @Record
    ORDER BY v.OpenedAt DESC;
END;
GO
