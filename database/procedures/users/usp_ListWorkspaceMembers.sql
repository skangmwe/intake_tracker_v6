-- =============================================
-- Author:      /dev-build-application (Slice 17 — Users & access admin)
-- Create Date: 2026-07-06
-- Description: Returns the members of one workspace for the S29 Users & access list —
--              SSO identity (display name / email), their level in this workspace,
--              last-active, and whether the account is disabled (BS §4.2 / blueprint S29).
--              The Users x WorkspaceMembership join takes this read out of single-table EF
--              CRUD (api-data-access.md), so it lives in a stored procedure. Read-only, no
--              result set beyond the projection (not an access-gate proc — the controller's
--              WorkspaceAdmin AccessGuard is the authoritative server-side check, mirroring
--              the approver-team read procs). Soft-deleted memberships excluded; disabled
--              accounts are STILL listed (an admin must see them to reassign — BS §6.8) but a
--              soft-deleted membership means the user is no longer in this workspace.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListWorkspaceMembers
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        appUser.UserId       AS UserId,
        appUser.DisplayName  AS DisplayName,
        appUser.Email        AS Email,
        membership.[Level]   AS [Level],
        appUser.IsDisabled   AS IsDisabled,
        appUser.LastSignInAt AS LastActiveAt
    FROM dbo.WorkspaceMembership AS membership
    INNER JOIN dbo.Users AS appUser
        ON appUser.UserId = membership.UserId
       AND appUser.IsDeleted = 0
    WHERE membership.WorkspaceId = @WorkspaceIdLocal
      AND membership.IsDeleted = 0
    ORDER BY appUser.DisplayName;
END;
GO
