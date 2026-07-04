-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Soft-clears one approver-team membership (S31). Idempotent — removing an
--              already-removed member is a no-op. No result set.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RemoveApproverTeamMember
    @WorkspaceId UNIQUEIDENTIFIER,
    @RoleLabel   NVARCHAR(120),
    @UserId      UNIQUEIDENTIFIER,
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @RoleLabelLocal   NVARCHAR(120)    = @RoleLabel;
    DECLARE @UserIdLocal      UNIQUEIDENTIFIER = @UserId;
    DECLARE @Actor            NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now              DATETIME2        = SYSUTCDATETIME();

    UPDATE dbo.ApproverTeamMembership
    SET IsDeleted = 1, DeletedAt = @Now, UpdatedBy = @Actor, UpdatedAt = @Now
    WHERE WorkspaceId = @WorkspaceIdLocal
      AND RoleLabel = @RoleLabelLocal
      AND UserId = @UserIdLocal
      AND IsDeleted = 0;
END;
GO
