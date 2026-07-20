-- =============================================
-- Author:      /dev-build-application (Slice 2 — Auth & app shell)
-- Create Date: 2026-07-03
-- Updated:     2026-07-20 (Invited membership state — S29) — after provisioning the user row, accept
--              any pending dbo.WorkspaceInvitation rows matching the caller's email: create the
--              corresponding WorkspaceMembership (skipping any that already exists) and mark the
--              invitation 'Accepted'. This is where an invited person becomes a real member — on their
--              first sign-in — with no manual accept step. Idempotent + atomic (provision + accept in
--              one transaction).
-- Description: Idempotent user provisioning called by EnsureUserMiddleware on the
--              first authenticated request per replica (api-auth.md). Inserts the
--              caller's row on first sign-in; on subsequent sign-ins refreshes
--              DisplayName / Email / LastSignInAt. The user's Theme preference is
--              PRESERVED across sign-ins (never reset by provisioning) — theme is
--              owned by usp path in the profile service, not by this upsert.
--
--              @UserId is the Entra `oid` claim (the only user identifier permitted
--              in logs — api-logging.md). @DisplayName / @Email are PII and are set
--              here from JWT claims; they are never logged. CreatedBy / UpdatedBy
--              carry the pseudonymous oid, never PII.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertUser
    @UserId       UNIQUEIDENTIFIER,
    @DisplayName  NVARCHAR(200),
    @Email        NVARCHAR(320),
    @SignInAt     DATETIME2
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Copy parameters into locals (parameter-sniffing mitigation).
    DECLARE @UserIdLocal      UNIQUEIDENTIFIER = @UserId;
    DECLARE @DisplayNameLocal NVARCHAR(200)    = @DisplayName;
    DECLARE @EmailLocal       NVARCHAR(320)    = LTRIM(RTRIM(@Email));
    DECLARE @SignInAtLocal    DATETIME2        = @SignInAt;
    DECLARE @Actor            NVARCHAR(256)    = CAST(@UserId AS NVARCHAR(36));
    DECLARE @Now              DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        MERGE dbo.Users AS target
        USING (SELECT @UserIdLocal AS UserId) AS source
            ON target.UserId = source.UserId
        WHEN MATCHED THEN
            UPDATE SET
                DisplayName  = @DisplayNameLocal,
                Email        = @EmailLocal,
                LastSignInAt = @SignInAtLocal,
                UpdatedAt    = @Now,
                UpdatedBy    = @Actor
        WHEN NOT MATCHED THEN
            INSERT (UserId, DisplayName, Email, LastSignInAt, IsDisabled, Theme,
                    CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
            VALUES (@UserIdLocal, @DisplayNameLocal, @EmailLocal, @SignInAtLocal, 0, N'light',
                    @Now, @Now, @Actor, @Actor, 0);

        -- Accept pending invitations addressed to this email: create the membership where the user is
        -- not already a live member of that workspace, then mark every matching invite Accepted.
        INSERT INTO dbo.WorkspaceMembership
            (MembershipId, WorkspaceId, UserId, [Level], CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT NEWID(), inv.WorkspaceId, @UserIdLocal, inv.[Level], @Actor, @Actor, @Now, @Now
        FROM dbo.WorkspaceInvitation AS inv
        WHERE inv.Email = @EmailLocal
          AND inv.Status = N'Invited'
          AND inv.IsDeleted = 0
          AND NOT EXISTS (
              SELECT 1 FROM dbo.WorkspaceMembership AS existingMember
              WHERE existingMember.WorkspaceId = inv.WorkspaceId
                AND existingMember.UserId = @UserIdLocal
                AND existingMember.IsDeleted = 0);

        UPDATE dbo.WorkspaceInvitation
        SET Status     = N'Accepted',
            AcceptedAt = @Now,
            UpdatedAt  = @Now,
            UpdatedBy  = @Actor
        WHERE Email = @EmailLocal
          AND Status = N'Invited'
          AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
