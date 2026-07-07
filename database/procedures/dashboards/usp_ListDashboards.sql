-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Lists the dashboards visible to a caller in one workspace (S17, BS §10.5).
--              Workspace membership is verified API-side before this runs, so the proc trusts
--              @WorkspaceId scope; it still filters IsDeleted = 0. Audience is a two-layer
--              predicate: a dashboard is visible when its audience kind is "everyone" OR the
--              caller is a member of the workspace.
--
--              R1 SIMPLIFICATION (documented per contract §5): all four seeded dashboards ship
--              audience { "kind":"everyone" }, so the "everyone" branch carries them. For a future
--              roles/named audience, R1 resolves it as "any workspace member sees it" — a genuine
--              role/group match is deferred. The everyone-passes branch is implemented explicitly
--              so tightening the membership branch later is a one-line change.
--
--              WidgetCount is the element count of WidgetsJson (OPENJSON). Ordered
--              IsDefault DESC, Name ASC so the workspace's default dashboard leads the list.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListDashboards
    @WorkspaceId UNIQUEIDENTIFIER,
    @UserId      UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @User UNIQUEIDENTIFIER = @UserId;

    SELECT
        sd.SavedDashboardId,
        sd.WorkspaceId,
        sd.Slug,
        sd.Name,
        sd.Description,
        sd.AudienceJson,
        sd.IsDefault,
        sd.ObjectType,
        (SELECT COUNT(*) FROM OPENJSON(sd.WidgetsJson)) AS WidgetCount,
        sd.UpdatedAt
    FROM dbo.SavedDashboard AS sd
    WHERE sd.WorkspaceId = @Ws
      AND sd.IsDeleted = 0
      AND (
            JSON_VALUE(sd.AudienceJson, N'$.kind') = N'everyone'
            OR EXISTS (
                SELECT 1 FROM dbo.WorkspaceMembership AS wm
                WHERE wm.WorkspaceId = sd.WorkspaceId
                  AND wm.UserId = @User
                  AND wm.IsDeleted = 0)
          )
    ORDER BY sd.IsDefault DESC, sd.Name ASC, sd.SavedDashboardId ASC;
END;
GO
