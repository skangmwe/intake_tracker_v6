-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: Returns a single dashboard definition by id (not deleted). The API reads this first
--              to determine existence (unknown/deleted → 404), then applies the access check
--              (member OR bound Dashboard-viewer → else 403; api-record-access.md). WidgetsJson is
--              returned whole so the service can compose each widget's data via the metric
--              resolvers. Returns ZERO rows for an unknown/deleted id. Visibility is enforced by
--              the caller; this proc trusts the id.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboardById
    @SavedDashboardId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IdLocal UNIQUEIDENTIFIER = @SavedDashboardId;

    SELECT
        sd.SavedDashboardId,
        sd.WorkspaceId,
        sd.Slug,
        sd.Name,
        sd.Description,
        sd.AudienceJson,
        sd.IsDefault,
        sd.ObjectType,
        sd.SupportsDrillThrough,
        sd.WidgetsJson,
        sd.IsSeeded,      -- v2 (slice 28) — seeded starters are read-only on the composer path
        sd.Visibility,    -- v2 (slice 28) — 'Shared' | 'Personal'
        sd.LayoutMode,    -- v2 (slice 28) — 'Fixed' (seeded) | 'Composed' (user-authored)
        sd.CreatedBy      -- v2 (slice 28) — author id string; gates Personal read/edit access
    FROM dbo.SavedDashboard AS sd
    WHERE sd.SavedDashboardId = @IdLocal
      AND sd.IsDeleted = 0;
END;
GO
