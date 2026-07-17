-- =============================================
-- Author:      /dev-build-application (Slice 25 — Object-level Relationships)
-- Create Date: 2026-07-16
-- Description: Lists all Relationships for a workspace (v2-reconciliation.md §API
--              deltas Relationships GET /workspaces/{id}/relationships). Read is Viewer+
--              (enforced at the controller via the workspace membership guard).
--
--              Retired rows are included so the S30 editor can render them under a
--              "Retired" section (with a Restore action). System rows sort first (they
--              back the config-driven tab bar) and are marked so the UI blocks the
--              edit/retire affordances.
--
--              Return columns follow shared/types/relationships.ts RelationshipDto.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListRelationships
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT r.RelationshipId,
           r.WorkspaceId,
           r.Name,
           r.FromObjectType,
           r.ToObjectType,
           r.Cardinality,
           r.FromSideLabel,
           r.ToSideLabel,
           r.ShowOnFromAsTab,
           r.TabLabel,
           r.SortOrder,
           r.IsRetired,
           r.IsSystem,
           r.CreatedAt,
           r.UpdatedAt,
           r.CreatedBy,
           r.UpdatedBy
    FROM   dbo.Relationships r
    WHERE  r.WorkspaceId = @Ws
      AND  r.IsDeleted   = 0
    ORDER  BY r.IsSystem DESC,   -- system first (they're the "always-on" tab drivers)
              r.FromObjectType,
              r.SortOrder,
              r.Name;
END;
GO
