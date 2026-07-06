-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: Grants the additive firm-wide Platform-admin grant to a user (S36 —
--              BS §4.2/§4.3). Exactly one of @TargetUserId / @Email identifies the user:
--                - @TargetUserId supplied -> grant that known user.
--                - @Email supplied        -> resolve to a REAL active platform user (email OR
--                                            display name), mirroring usp_UpsertWorkspaceMembership.
--                                            no match -> THROW 50020; ambiguous -> THROW 50021.
--              Idempotent: reactivates a soft-deleted grant, or is a no-op on a live grant, or
--              inserts a new one (the UX_PlatformAdminGrant_UserId filtered unique index keeps at
--              most one active grant per user). Returns the resolved (UserId, DisplayName,
--              WasAdded) so the service emits a precise firm-wide-audit event. Not an access-gate
--              proc — the controller's Platform-admin AccessGuard is authoritative.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertPlatformAdminGrant
    @TargetUserId UNIQUEIDENTIFIER = NULL,
    @Email        NVARCHAR(320)    = NULL,
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Actor          NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now            DATETIME2        = SYSUTCDATETIME();
    DECLARE @ResolvedUserId UNIQUEIDENTIFIER = @TargetUserId;

    -- Resolve @Email BEFORE opening a transaction so an unresolved/ambiguous guard THROW never issues
    -- a ROLLBACK (tSQLt-safe). The UX_PlatformAdminGrant_UserId filtered-unique index is the backstop.
    IF @ResolvedUserId IS NULL
    BEGIN
        DECLARE @EmailLocal NVARCHAR(320) = LTRIM(RTRIM(@Email));

        DECLARE @Matches TABLE (UserId UNIQUEIDENTIFIER);
        INSERT INTO @Matches (UserId)
        SELECT appUser.UserId
        FROM dbo.Users AS appUser
        WHERE appUser.IsDeleted = 0
          AND (appUser.Email = @EmailLocal OR appUser.DisplayName = @EmailLocal);

        DECLARE @MatchCount INT = (SELECT COUNT(*) FROM @Matches);

        IF @MatchCount = 0
            THROW 50020, 'No active user matches that name or email.', 1;
        IF @MatchCount > 1
            THROW 50021, 'More than one user matches — use the exact email address.', 1;

        SET @ResolvedUserId = (SELECT TOP (1) UserId FROM @Matches);
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @WasAdded BIT = 0;

        -- Reactivate a soft-deleted grant if one exists.
        UPDATE dbo.PlatformAdminGrant
        SET IsDeleted = 0, DeletedAt = NULL, GrantedAt = @Now, UpdatedAt = @Now, UpdatedBy = @Actor
        WHERE UserId = @ResolvedUserId AND IsDeleted = 1;

        IF @@ROWCOUNT > 0
            SET @WasAdded = 1;

        -- Insert a fresh grant only when none (active or reactivated) exists.
        IF NOT EXISTS (SELECT 1 FROM dbo.PlatformAdminGrant WHERE UserId = @ResolvedUserId AND IsDeleted = 0)
        BEGIN
            INSERT INTO dbo.PlatformAdminGrant (GrantId, UserId, GrantedAt, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            VALUES (NEWID(), @ResolvedUserId, @Now, @Actor, @Actor, @Now, @Now);
            SET @WasAdded = 1;
        END

        SELECT
            appUser.UserId      AS UserId,
            appUser.DisplayName AS DisplayName,
            @WasAdded           AS WasAdded
        FROM dbo.Users AS appUser
        WHERE appUser.UserId = @ResolvedUserId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
