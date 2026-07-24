-- =============================================
-- Author:      Announcements platform broadcast
-- Create Date: 2026-07-24
-- Description: The workspaces a platform admin may broadcast to — every non-deleted workspace except the
--              PG/Dept clone template (which is a clone source, not a workspace you post to). Platform-admin
--              is enforced at the controller. Bounded reference list (there are few workspaces) — not
--              paginated. Ordered by Name for a stable target picker.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListPlatformWorkspaces
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT
        w.WorkspaceId,
        w.Name,
        w.Kind
    FROM dbo.Workspaces AS w
    WHERE w.IsDeleted = 0
      AND w.Kind <> N'pg-dept-template'
    ORDER BY w.Name;
END;
GO
