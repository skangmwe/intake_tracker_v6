-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Adds a member to a workspace's approver team for a role label (S31). @Person
--              is a typed display name or email; it is resolved to a REAL active workspace
--              member (never stored as free text). Guards:
--                - no active member matches @Person        -> THROW (unresolved)
--                - more than one active member matches      -> THROW (ambiguous)
--              Idempotent: a duplicate add is a no-op. Returns the resolved member
--              (UserId, DisplayName) as its single result set. Not an access-gate proc.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_AddApproverTeamMember
    @WorkspaceId UNIQUEIDENTIFIER,
    @RoleLabel   NVARCHAR(120),
    @Person      NVARCHAR(256),
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @RoleLabelLocal   NVARCHAR(120)    = @RoleLabel;
    DECLARE @PersonLocal      NVARCHAR(256)    = LTRIM(RTRIM(@Person));
    DECLARE @Actor            NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now              DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Resolve @Person against active members of THIS workspace (display name or email).
        DECLARE @Matches TABLE (UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(256));
        INSERT INTO @Matches (UserId, DisplayName)
        SELECT appUser.UserId, appUser.DisplayName
        FROM dbo.Users AS appUser
        INNER JOIN dbo.WorkspaceMembership AS membership
            ON membership.UserId = appUser.UserId
           AND membership.WorkspaceId = @WorkspaceIdLocal
           AND membership.IsDeleted = 0
        WHERE appUser.IsDeleted = 0
          AND (appUser.DisplayName = @PersonLocal OR appUser.Email = @PersonLocal);

        DECLARE @MatchCount INT = (SELECT COUNT(*) FROM @Matches);

        IF @MatchCount = 0
            THROW 50020, 'No active member of this workspace matches that name or email.', 1;
        IF @MatchCount > 1
            THROW 50021, 'More than one member matches — use the exact email address.', 1;

        DECLARE @UserId UNIQUEIDENTIFIER = (SELECT TOP (1) UserId FROM @Matches);

        -- Idempotent add — the filtered unique index also backstops concurrent duplicates.
        IF NOT EXISTS (
            SELECT 1 FROM dbo.ApproverTeamMembership
            WHERE WorkspaceId = @WorkspaceIdLocal AND RoleLabel = @RoleLabelLocal
              AND UserId = @UserId AND IsDeleted = 0)
        BEGIN
            INSERT INTO dbo.ApproverTeamMembership (WorkspaceId, RoleLabel, UserId, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
            VALUES (@WorkspaceIdLocal, @RoleLabelLocal, @UserId, @Actor, @Actor, @Now, @Now);
        END

        -- Single result set: the resolved member.
        SELECT UserId AS UserId, DisplayName AS DisplayName FROM @Matches;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
