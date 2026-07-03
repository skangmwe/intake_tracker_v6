-- =============================================
-- Author:      /dev-build-application (Slice 2 — Auth & app shell)
-- Create Date: 2026-07-03
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
--
--              MERGE is the single atomic upsert. SET XACT_ABORT ON propagates any
--              error; the statement is self-contained (no caller transaction needed).
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
    DECLARE @EmailLocal       NVARCHAR(320)    = @Email;
    DECLARE @SignInAtLocal    DATETIME2        = @SignInAt;
    DECLARE @Actor            NVARCHAR(256)    = CAST(@UserId AS NVARCHAR(36));
    DECLARE @Now              DATETIME2        = SYSUTCDATETIME();

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
END;
GO
