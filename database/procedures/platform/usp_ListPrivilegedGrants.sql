-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: The S36 privileged-grants directory (BS §4.2/§4.3). One result set, newest
--              grant first, with a GrantKind discriminator:
--                - 'PlatformAdmin'  — a firm-wide Platform-admin grant (PlatformAdminGrant);
--                                     WorkspaceId / WorkspaceName are NULL.
--                - 'WorkspaceAdmin' — a per-workspace WorkspaceAdmin membership, shown so the
--                                     directory reads as the full privileged-access picture.
--              Exposes user PII (name/email) — the controller gates the whole surface on the
--              caller's Platform-admin padGrant. Platform-admin holders are managed here
--              (usp_Upsert/RevokePlatformAdminGrant); WorkspaceAdmin rows are read-only in S36
--              (membership changes stay in S29 / the Users module — module-boundaries §21/§1).
--              Not an access-gate proc.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListPrivilegedGrants
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT
        N'PlatformAdmin'         AS GrantKind,
        appUser.UserId           AS UserId,
        appUser.DisplayName      AS DisplayName,
        appUser.Email            AS Email,
        CAST(NULL AS UNIQUEIDENTIFIER) AS WorkspaceId,
        CAST(NULL AS NVARCHAR(200))    AS WorkspaceName,
        padGrant.GrantedAt          AS GrantedAt
    FROM dbo.PlatformAdminGrant AS padGrant
    INNER JOIN dbo.Users AS appUser
        ON appUser.UserId = padGrant.UserId AND appUser.IsDeleted = 0
    WHERE padGrant.IsDeleted = 0

    UNION ALL

    SELECT
        N'WorkspaceAdmin'        AS GrantKind,
        appUser.UserId           AS UserId,
        appUser.DisplayName      AS DisplayName,
        appUser.Email            AS Email,
        ws.WorkspaceId           AS WorkspaceId,
        ws.Name                  AS WorkspaceName,
        membership.CreatedAt     AS GrantedAt
    FROM dbo.WorkspaceMembership AS membership
    INNER JOIN dbo.Users AS appUser
        ON appUser.UserId = membership.UserId AND appUser.IsDeleted = 0
    INNER JOIN dbo.Workspaces AS ws
        ON ws.WorkspaceId = membership.WorkspaceId AND ws.IsDeleted = 0
    WHERE membership.[Level] = N'WorkspaceAdmin'
      AND membership.IsDeleted = 0

    ORDER BY GrantedAt DESC;
END;
GO
