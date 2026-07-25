-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: Returns a rejected slot to Pending so it can be signed again after follow-up
--              (api-contracts.md §6, data-model.md §ApprovalDecision "rejection replay"). Supersedes
--              the slot's live Rejected decision — the historical rejection row is retained (visible
--              as "Rejected · signer · time" + comment), never mutated or deleted. Recomputes the
--              gate state: ChangesRequested while any other slot is still rejected, otherwise Pending.
--              A slot that was never rejected is a no-op. Access-gated on the caller's membership:
--              no row → empty result set (→ 403). Returns the updated gate via vw_ApprovalRequestDetail.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ReRequestApproval
    @ApprovalRequestId UNIQUEIDENTIFIER,
    @UserId            UNIQUEIDENTIFIER,
    @SlotIndex         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ar     UNIQUEIDENTIFIER = @ApprovalRequestId;
    DECLARE @By     UNIQUEIDENTIFIER = @UserId;
    DECLARE @ByText NVARCHAR(256)    = CAST(@UserId AS NVARCHAR(256));
    DECLARE @Slot   INT              = @SlotIndex;

    DECLARE @WsId UNIQUEIDENTIFIER, @State NVARCHAR(24), @Frozen NVARCHAR(MAX), @SlotCount INT;

    -- Access gate: re-requesting a rejected slot is a write → Member+ on the gate's workspace.
    -- No qualifying row → nothing (→ 403).
    SELECT @WsId = ar.WorkspaceId, @State = ar.State, @Frozen = ar.FrozenApproverSet
    FROM dbo.ApprovalRequests AS ar
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = ar.WorkspaceId AND m.UserId = @By AND m.IsDeleted = 0
       AND m.Level IN (N'Member', N'WorkspaceAdmin')
    WHERE ar.ApprovalRequestId = @Ar AND ar.IsDeleted = 0;

    IF @WsId IS NULL
        RETURN;

    IF @State = N'Resolved'
        THROW 50055, N'usp_ReRequestApproval: this gate is already resolved.', 1;

    SET @SlotCount = (SELECT COUNT(*) FROM OPENJSON(@Frozen));

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Return a rejected slot to pending — supersede its live rejection (history retained).
        UPDATE dbo.ApprovalDecisions
        SET SupersededAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @ByText
        WHERE ApprovalRequestId = @Ar AND SlotIndex = @Slot
          AND SupersededAt IS NULL AND IsDeleted = 0 AND Decision = N'Rejected';

        DECLARE @LiveApproved INT = (
            SELECT COUNT(*) FROM dbo.ApprovalDecisions
            WHERE ApprovalRequestId = @Ar AND SupersededAt IS NULL AND IsDeleted = 0 AND Decision = N'Approved');
        DECLARE @LiveRejected INT = (
            SELECT COUNT(*) FROM dbo.ApprovalDecisions
            WHERE ApprovalRequestId = @Ar AND SupersededAt IS NULL AND IsDeleted = 0 AND Decision = N'Rejected');

        DECLARE @NewState NVARCHAR(24) =
            CASE
                WHEN @LiveRejected > 0           THEN N'ChangesRequested'
                WHEN @LiveApproved >= @SlotCount THEN N'Resolved'
                ELSE N'Pending'
            END;

        UPDATE dbo.ApprovalRequests
        SET State      = @NewState,
            ResolvedAt = CASE WHEN @NewState = N'Resolved' THEN SYSUTCDATETIME() ELSE NULL END,
            UpdatedAt  = SYSUTCDATETIME(),
            UpdatedBy  = @ByText
        WHERE ApprovalRequestId = @Ar;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT
        v.ApprovalRequestId, v.RequestRecordId, v.WorkspaceId, v.GateDefinitionId, v.GateName,
        v.FromStageKey, v.ToStageKey, v.FromStageLabel, v.ToStageLabel, v.State,
        v.OpenedAt, v.ResolvedAt, v.RespondByDate, v.FrozenApproverSet, v.DecisionsJson
    FROM dbo.vw_ApprovalRequestDetail AS v
    WHERE v.ApprovalRequestId = @Ar;
END;
GO
