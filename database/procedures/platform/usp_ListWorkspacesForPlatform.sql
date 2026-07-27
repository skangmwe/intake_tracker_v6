-- =============================================
-- Author:      Workspace provisioning redesign
-- Create Date: 2026-07-27
-- Description: The rich Platform → Workspaces list. One row per non-deleted workspace except the
--              pg-dept-template clone source. Owner = DisplayName of the earliest active
--              WorkspaceAdmin membership (NULL when none). MemberCount = active memberships.
--              IsArchived from RetiredAt. Bounded reference list (few workspaces) — not paginated,
--              consistent with usp_ListPlatformWorkspaces. Platform-admin enforced at the controller.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListWorkspacesForPlatform
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT
        w.WorkspaceId,
        w.Name,
        w.Kind,
        w.Prefix,
        owner.DisplayName AS OwnerDisplayName,
        (SELECT COUNT(1)
           FROM dbo.WorkspaceMembership AS m
          WHERE m.WorkspaceId = w.WorkspaceId AND m.IsDeleted = 0) AS MemberCount,
        w.CreatedAt AS ProvisionedAt,
        CAST(CASE WHEN w.RetiredAt IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS IsArchived
    FROM dbo.Workspaces AS w
    OUTER APPLY (
        SELECT TOP (1) u.DisplayName
          FROM dbo.WorkspaceMembership AS wa
          JOIN dbo.Users AS u ON u.UserId = wa.UserId AND u.IsDeleted = 0
         WHERE wa.WorkspaceId = w.WorkspaceId
           AND wa.IsDeleted = 0
           AND wa.Level = N'WorkspaceAdmin'
         ORDER BY wa.CreatedAt, wa.MembershipId
    ) AS owner
    WHERE w.IsDeleted = 0
      AND w.Kind <> N'pg-dept-template'
    ORDER BY w.Kind, w.Name;
END;
GO
