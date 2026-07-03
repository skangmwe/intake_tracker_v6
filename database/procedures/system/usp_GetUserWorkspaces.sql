-- =============================================
-- Author:      /dev-build-application (Slice 2 — Auth & app shell)
-- Create Date: 2026-07-03
-- Description: Returns the caller's workspace memberships joined to each workspace
--              (name / kind / prefix) for GET /api/v1/users/me. The join takes this
--              read out of single-table EF CRUD (api-data-access.md), so it lives in
--              a stored procedure. Read-only, no result set beyond the projection
--              (it is not an access-gate proc — database-stored-procedures.md).
--              Soft-deleted memberships and workspaces are excluded.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetUserWorkspaces
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserIdLocal UNIQUEIDENTIFIER = @UserId;

    SELECT
        w.WorkspaceId                  AS WorkspaceId,
        w.Name                         AS WorkspaceName,
        w.Kind                         AS WorkspaceKind,
        w.Prefix                       AS WorkspacePrefix,
        m.Level                        AS Level,
        m.IsDashboardViewer            AS IsDashboardViewer,
        m.BoundDashboardId             AS BoundDashboardId
    FROM dbo.WorkspaceMembership AS m
    INNER JOIN dbo.Workspaces AS w
        ON w.WorkspaceId = m.WorkspaceId
       AND w.IsDeleted = 0
    WHERE m.UserId = @UserIdLocal
      AND m.IsDeleted = 0
    ORDER BY w.Name;
END;
GO
