-- =============================================
-- Author:      /dev-build-application (Slice 17 — Users & access admin)
-- Create Date: 2026-07-06
-- Description: Deactivates a user (S29, api-contracts §2 DELETE /workspaces/{id}/members/{userId}),
--              enforcing the BS §6.8 Phase-1 safety floor.
--
--              Safety floor:
--                A user with a PENDING NAMED-INDIVIDUAL sign-off cannot be deactivated (a frozen
--                Approval Request must never point at a dead account). Team-slot sign-offs do NOT
--                block — being an eligible member of a team slot is fine (api-contracts §2). In the
--                team-only slot model (slice 4 reconciliation) no slot names an individual, so this
--                guard is structurally present but never fires in Phase 1; it is honoured against a
--                slot's `namedUserId` marker so it works forward-compat if named slots are ever added.
--                On the block: THROW 50030 -> the service maps it to 409.
--
--              On success (BS §6.8 "the account is disabled immediately"):
--                - Users.IsDisabled = 1 (firm-wide — notifications to disabled accounts are
--                  suppressed by the slice-12 fan-out).
--                - the caller's WorkspaceMembership row for THIS workspace is soft-deleted
--                  (removed from the workspace). Open owned/assigned records do NOT block — they
--                  become orphaned references, reassigned manually by an admin (BS §6.8).
--
--              Idempotent: re-deactivating an already-disabled / already-removed member is a no-op
--              that still succeeds. Not an access-gate proc — the controller's WorkspaceAdmin
--              AccessGuard is the authoritative check (approver-team precedent).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeactivateMember
    @WorkspaceId  UNIQUEIDENTIFIER,
    @TargetUserId UNIQUEIDENTIFIER,
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Target           UNIQUEIDENTIFIER = @TargetUserId;
    DECLARE @Actor            NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now              DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Safety floor: block on a pending NAMED-INDIVIDUAL sign-off (unresolved gate whose
        -- frozen slot names this user individually). Team slots (roleLabel + eligibleMembers,
        -- no namedUserId) never match, so being an eligible team member does not block.
        IF EXISTS (
            SELECT 1
            FROM dbo.ApprovalRequests AS ar
            CROSS APPLY OPENJSON(ar.FrozenApproverSet)
                WITH (NamedUserId UNIQUEIDENTIFIER '$.namedUserId') AS slot
            WHERE ar.IsDeleted = 0
              AND ar.State <> N'Resolved'
              AND slot.NamedUserId = @Target
        )
            THROW 50030, 'Cannot deactivate a user with a pending individual sign-off. Reassign or resolve it first.', 1;

        -- Disable the account firm-wide (idempotent — only touch a not-yet-disabled row).
        UPDATE dbo.Users
        SET IsDisabled = 1,
            UpdatedAt  = @Now,
            UpdatedBy  = @Actor
        WHERE UserId = @Target AND IsDisabled = 0 AND IsDeleted = 0;

        -- Remove the member from THIS workspace (soft delete; idempotent on the live row).
        UPDATE dbo.WorkspaceMembership
        SET IsDeleted = 1,
            DeletedAt = @Now,
            UpdatedAt = @Now,
            UpdatedBy = @Actor
        WHERE WorkspaceId = @WorkspaceIdLocal AND UserId = @Target AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
