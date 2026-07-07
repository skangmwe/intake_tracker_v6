-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Metric resolver — count of open requests with a gate awaiting sign-off (S14
--              "Pending sign-off" tile). A record is pending sign-off when it has at least one
--              unresolved ApprovalRequest (State ∈ Pending, ChangesRequested — slice 8). "Open" =
--              no closure outcome in FieldValues. The gate row is matched on the composite
--              (WorkspaceId, RequestRecordId) so it stays on the caller's side of an escalated
--              record. Single-row result (Cnt). Scoped to @WorkspaceId AND IsDeleted = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardPendingSignoff
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT COUNT(*) AS Cnt
    FROM dbo.Requests AS r
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
      AND EXISTS (
            SELECT 1
            FROM dbo.ApprovalRequests AS ar
            WHERE ar.WorkspaceId = r.WorkspaceId
              AND ar.RequestRecordId = r.RecordId
              AND ar.IsDeleted = 0
              AND ar.State IN (N'Pending', N'ChangesRequested'));
END;
GO
