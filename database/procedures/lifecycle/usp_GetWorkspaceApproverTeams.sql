-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Returns the approver-team roster for a workspace (S31) — one row per
--              (role label, member), with the member's display name. The service groups by
--              role label. Members are real users; DisplayName is joined for presentation.
--              Soft-deleted rows excluded.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceApproverTeams
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        member.RoleLabel AS RoleLabel,
        member.UserId    AS UserId,
        appUser.DisplayName AS DisplayName
    FROM dbo.ApproverTeamMembership AS member
    INNER JOIN dbo.Users AS appUser
        ON appUser.UserId = member.UserId
       AND appUser.IsDeleted = 0
    WHERE member.WorkspaceId = @WorkspaceIdLocal
      AND member.IsDeleted = 0
    ORDER BY member.RoleLabel, appUser.DisplayName;
END;
GO
