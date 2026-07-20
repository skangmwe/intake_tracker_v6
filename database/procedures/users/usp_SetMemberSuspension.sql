-- =============================================
-- Author:      Users & access — Suspend / Reactivate (S29)
-- Create Date: 2026-07-20
-- Description: Suspends or reactivates a workspace member (S29). Unlike usp_DeactivateMember (which
--              disables the account AND removes the membership), this toggles ONLY the firm-wide
--              Users.IsDisabled flag and leaves the WorkspaceMembership row in place, so the member
--              stays in the list with Status derived as Suspended (IsDisabled = 1) or Active
--              (IsDisabled = 0) by usp_ListWorkspaceMembers.
--
--              Scope guard: only acts on a LIVE member of THIS workspace — a WorkspaceAdmin of one
--              workspace must not toggle the firm-wide disabled flag of a user who is not in it. No
--              membership → a silent no-op (the caller is already WorkspaceAdmin-gated at the API).
--
--              Safety floor (suspend only): a user who is the NAMED individual on a pending sign-off
--              cannot be suspended — a disabled account must not remain the named approver of an
--              unresolved gate. Mirrors usp_DeactivateMember. THROW 50030 → the service maps it to 409.
--              Reactivation (@Suspended = 0) has no floor.
--
--              Idempotent: re-suspending an already-suspended member (or reactivating an active one)
--              is a no-op that still succeeds. Not an access-gate proc — the controller's
--              WorkspaceAdmin AccessGuard is the authoritative check.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SetMemberSuspension
    @WorkspaceId  UNIQUEIDENTIFIER,
    @TargetUserId UNIQUEIDENTIFIER,
    @Suspended    BIT,
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Target           UNIQUEIDENTIFIER = @TargetUserId;
    DECLARE @SuspendedLocal    BIT             = @Suspended;
    DECLARE @Actor            NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now              DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Only a live member of THIS workspace can be suspended/reactivated here.
        IF EXISTS (
            SELECT 1
            FROM dbo.WorkspaceMembership
            WHERE WorkspaceId = @WorkspaceIdLocal AND UserId = @Target AND IsDeleted = 0
        )
        BEGIN
            -- Safety floor (suspend only): block on a pending NAMED-INDIVIDUAL sign-off.
            IF @SuspendedLocal = 1 AND EXISTS (
                SELECT 1
                FROM dbo.ApprovalRequests AS ar
                CROSS APPLY OPENJSON(ar.FrozenApproverSet)
                    WITH (NamedUserId UNIQUEIDENTIFIER '$.namedUserId') AS slot
                WHERE ar.IsDeleted = 0
                  AND ar.State <> N'Resolved'
                  AND slot.NamedUserId = @Target
            )
                THROW 50030, 'Cannot suspend a user with a pending individual sign-off. Reassign or resolve it first.', 1;

            -- Toggle the firm-wide disabled flag; idempotent (only touch a row whose flag changes).
            UPDATE dbo.Users
            SET IsDisabled = @SuspendedLocal,
                UpdatedAt  = @Now,
                UpdatedBy  = @Actor
            WHERE UserId = @Target AND IsDeleted = 0 AND IsDisabled <> @SuspendedLocal;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
