-- =============================================
-- Author:      /dev-build-application (Slice 17 — Users & access admin)
-- Create Date: 2026-07-06
-- Updated:     2026-07-20 (Invited membership state — S29) — returns the UNION of real memberships and
--              pending invitations. A membership row carries Status 'Active' or 'Suspended' (derived
--              from IsDisabled) with a null InvitationId; a pending-invitation row carries Status
--              'Invited' with a null UserId / DisplayName / LastActiveAt and its InvitationId (used by
--              the Cancel-invitation action). Invited rows sort after real members.
-- Description: Returns the members of one workspace for the S29 Users & access list —
--              SSO identity (display name / email), their level in this workspace,
--              last-active, status, and (for invites) the invitation id (BS §4.2 / blueprint S29).
--              Reads across Users x WorkspaceMembership and WorkspaceInvitation, so it lives in a
--              stored procedure (api-data-access.md). Read-only, no result set beyond the projection
--              (not an access-gate proc — the controller's WorkspaceAdmin AccessGuard is the
--              authoritative server-side check). Soft-deleted memberships/invitations excluded;
--              disabled accounts are STILL listed (an admin must see them to reassign — BS §6.8).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListWorkspaceMembers
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;

    WITH MembersAndInvites AS
    (
        -- Real memberships (Active / Suspended).
        SELECT
            appUser.UserId        AS UserId,
            appUser.DisplayName   AS DisplayName,
            appUser.Email         AS Email,
            membership.[Level]    AS [Level],
            appUser.IsDisabled    AS IsDisabled,
            appUser.LastSignInAt  AS LastActiveAt,
            CASE WHEN appUser.IsDisabled = 1 THEN N'Suspended' ELSE N'Active' END AS [Status],
            CAST(NULL AS UNIQUEIDENTIFIER) AS InvitationId,
            0                     AS SortGroup
        FROM dbo.WorkspaceMembership AS membership
        INNER JOIN dbo.Users AS appUser
            ON appUser.UserId = membership.UserId
           AND appUser.IsDeleted = 0
        WHERE membership.WorkspaceId = @WorkspaceIdLocal
          AND membership.IsDeleted = 0

        UNION ALL

        -- Pending invitations (Invited) — no user row yet.
        SELECT
            CAST(NULL AS UNIQUEIDENTIFIER) AS UserId,
            CAST(NULL AS NVARCHAR(200))    AS DisplayName,
            invite.Email                   AS Email,
            invite.[Level]                 AS [Level],
            CAST(0 AS BIT)                 AS IsDisabled,
            CAST(NULL AS DATETIME2)        AS LastActiveAt,
            N'Invited'                     AS [Status],
            invite.InvitationId            AS InvitationId,
            1                              AS SortGroup
        FROM dbo.WorkspaceInvitation AS invite
        WHERE invite.WorkspaceId = @WorkspaceIdLocal
          AND invite.Status = N'Invited'
          AND invite.IsDeleted = 0
    )
    SELECT
        UserId, DisplayName, Email, [Level], IsDisabled, LastActiveAt, [Status], InvitationId
    FROM MembersAndInvites
    ORDER BY SortGroup, COALESCE(DisplayName, Email);
END;
GO
