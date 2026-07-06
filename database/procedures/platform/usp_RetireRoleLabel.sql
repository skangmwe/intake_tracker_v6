-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: Retires (soft-deletes) a role label in the platform RoleLabelCatalog (S37 —
--              BS §7.2). Forward-only: a retired label disappears from the S31 selectors for
--              NEW gate configuration, but existing gate slots / approver-team rows that
--              reference the label string keep working, and past sign-offs keep their captured
--              label — this proc does NOT touch GateApproverSlot / ApproverTeamMembership /
--              ApprovalRequest. Idempotent: retiring an already-retired or unknown label is a
--              harmless no-op (the DELETE endpoint returns 204 either way). No result set.
--              Not an access-gate proc — the controller's Platform-admin AccessGuard is
--              authoritative.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RetireRoleLabel
    @RoleLabelId UNIQUEIDENTIFIER,
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id    UNIQUEIDENTIFIER = @RoleLabelId;
    DECLARE @Actor NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.RoleLabelCatalog
        SET IsDeleted = 1, DeletedAt = @Now, UpdatedAt = @Now, UpdatedBy = @Actor
        WHERE RoleLabelId = @Id AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
