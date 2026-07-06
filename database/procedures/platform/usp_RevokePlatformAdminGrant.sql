-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: Revokes a user's firm-wide Platform-admin grant (S36 — BS §4.2/§4.3) by
--              soft-deleting the PlatformAdminGrant row. Idempotent: revoking a user with no
--              active grant affects 0 rows (the service maps that to 404). The grant is additive
--              and not a workspace level, so revoking it never touches WorkspaceMembership. No
--              result set. Not an access-gate proc — the controller's Platform-admin AccessGuard
--              is authoritative, and a Platform admin revoking their own last grant is permitted
--              (the firm-wide-audit event records who did it).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RevokePlatformAdminGrant
    @TargetUserId UNIQUEIDENTIFIER,
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @UserId UNIQUEIDENTIFIER = @TargetUserId;
    DECLARE @Actor  NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now    DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.PlatformAdminGrant
        SET IsDeleted = 1, DeletedAt = @Now, UpdatedAt = @Now, UpdatedBy = @Actor
        WHERE UserId = @UserId AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
