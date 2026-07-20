-- =============================================
-- Author:      slice/invited-membership-state (Invited membership state — S29)
-- Create Date: 2026-07-20
-- Description: Cancels a pending workspace invitation (S29 — DELETE
--              /workspaces/{id}/invitations/{invitationId}). Soft-cancel: sets Status = 'Cancelled'
--              (the row is retained for audit, not hard-deleted). Scoped to the workspace — the
--              invitation must belong to @WorkspaceId AND still be 'Invited', so a stale, already-
--              accepted, or cross-workspace id changes nothing. Returns a single Cancelled bit
--              (1 = a live invite was cancelled, 0 = no matching live invite) so the service maps a
--              miss to 403 (never disclose existence — api-record-access.md). Not an access-gate proc;
--              the controller's WorkspaceAdmin AccessGuard is the authoritative check.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CancelInvitation
    @WorkspaceId  UNIQUEIDENTIFIER,
    @InvitationId UNIQUEIDENTIFIER,
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WorkspaceIdLocal  UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @InvitationIdLocal UNIQUEIDENTIFIER = @InvitationId;
    DECLARE @Actor             NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now               DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.WorkspaceInvitation
        SET Status    = N'Cancelled',
            UpdatedAt = @Now,
            UpdatedBy = @Actor
        WHERE InvitationId = @InvitationIdLocal
          AND WorkspaceId  = @WorkspaceIdLocal
          AND Status = N'Invited'
          AND IsDeleted = 0;

        DECLARE @Cancelled BIT = CASE WHEN @@ROWCOUNT > 0 THEN 1 ELSE 0 END;

        SELECT @Cancelled AS Cancelled;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
