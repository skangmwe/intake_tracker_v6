-- =============================================
-- Author:      /dev-build-application (Slice 17 — Users & access admin)
-- Create Date: 2026-07-06
-- Updated:     2026-07-20 (Invited membership state — S29) — an @Email that does NOT resolve to an
--              active platform user now records a pending dbo.WorkspaceInvitation instead of throwing
--              50020. The result set gains an Outcome column: 'Member' (added/level-changed against a
--              real user) or 'Invited' (a pending invitation was created). UserId is NULL on the
--              'Invited' row. A second live invitation for the same (workspace, email) throws 50022.
-- Description: Adds a workspace member or changes an existing member's level (S29,
--              api-contracts §2 POST /workspaces/{id}/members). Exactly one of @TargetUserId
--              / @Email identifies the member:
--                - @TargetUserId supplied -> change that member's level (or add by known id).
--                - @Email supplied        -> resolve to a REAL active platform user (display
--                                            name or email); if none, create an Invited invitation.
--              Guards on the @Email path (reuse the approver-team error numbers so the service
--              maps them the same way):
--                - more than one user matches  -> THROW 50021 (ambiguous)
--                - a live invite already exists -> THROW 50022 (already invited)
--              Membership upsert is idempotent: reactivate a soft-deleted membership, or update the
--              level of a live one, or insert a new membership. Returns (UserId, Level, WasAdded,
--              Outcome) as its single result set so the service can emit a precise event. Not an
--              access-gate proc — the controller's WorkspaceAdmin AccessGuard is the authoritative
--              check. @Level is validated at the controller boundary and by CK_WorkspaceMembership_Level.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertWorkspaceMembership
    @WorkspaceId  UNIQUEIDENTIFIER,
    @TargetUserId UNIQUEIDENTIFIER = NULL,
    @Email        NVARCHAR(320)    = NULL,
    @Level        NVARCHAR(32),
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @LevelLocal       NVARCHAR(32)     = @Level;
    DECLARE @Actor            NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now              DATETIME2        = SYSUTCDATETIME();
    DECLARE @ResolvedUserId   UNIQUEIDENTIFIER = @TargetUserId;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Resolve @Email -> a real active platform user when no id was supplied.
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

            IF @MatchCount > 1
                THROW 50021, 'More than one user matches — use the exact email address.', 1;

            IF @MatchCount = 0
            BEGIN
                -- Unknown email -> record a pending invitation (auto-accepted on first sign-in).
                IF EXISTS (
                    SELECT 1 FROM dbo.WorkspaceInvitation
                    WHERE WorkspaceId = @WorkspaceIdLocal AND Email = @EmailLocal
                      AND Status = N'Invited' AND IsDeleted = 0)
                    THROW 50022, 'That email already has a pending invitation.', 1;

                INSERT INTO dbo.WorkspaceInvitation
                    (WorkspaceId, Email, [Level], Status, InvitedBy, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
                VALUES
                    (@WorkspaceIdLocal, @EmailLocal, @LevelLocal, N'Invited', @Actor, @Actor, @Actor, @Now, @Now);

                SELECT
                    CAST(NULL AS UNIQUEIDENTIFIER) AS UserId,
                    @LevelLocal                    AS [Level],
                    CAST(0 AS BIT)                 AS WasAdded,
                    N'Invited'                     AS Outcome;

                COMMIT TRANSACTION;
                RETURN;
            END

            SET @ResolvedUserId = (SELECT TOP (1) UserId FROM @Matches);
        END

        DECLARE @WasAdded BIT = 0;

        -- Reactivate a soft-deleted membership OR update a live one's level.
        UPDATE dbo.WorkspaceMembership
        SET [Level]   = @LevelLocal,
            IsDeleted = 0,
            DeletedAt = NULL,
            UpdatedAt = @Now,
            UpdatedBy = @Actor
        WHERE WorkspaceId = @WorkspaceIdLocal AND UserId = @ResolvedUserId;

        IF @@ROWCOUNT = 0
        BEGIN
            INSERT INTO dbo.WorkspaceMembership
                (MembershipId, WorkspaceId, UserId, [Level], CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            VALUES
                (NEWID(), @WorkspaceIdLocal, @ResolvedUserId, @LevelLocal, @Actor, @Actor, @Now, @Now);
            SET @WasAdded = 1;
        END

        -- Single result set: the resolved member + whether this was an add + the outcome.
        SELECT @ResolvedUserId AS UserId, @LevelLocal AS [Level], @WasAdded AS WasAdded, N'Member' AS Outcome;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
