-- =============================================
-- Author:      /dev-build-application (Slice B2 — Platform Relationships tab)
-- Create Date: 2026-07-22
-- Description: The canonical system-seeded relationships that every workspace inherits, surfaced
--              read-only on the Platform Fields & objects → Relationships tab (S34). Relationships
--              are workspace-local metadata (shared/types/relationships.ts) with no Global scope, so
--              the same system relationship (e.g. Request → Task) exists once per workspace. This
--              proc de-duplicates them to one canonical row per (Name, From, To, Cardinality) shape
--              across all workspaces, so the platform reference shows each inherited relationship a
--              single time. Only active (non-retired, non-deleted) system rows are returned.
--              Columns mirror usp_ListRelationships so the API reuses the RelationshipRow projection.
--              Not an access-gate proc — the controller verifies the Platform-admin grant.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetPlatformRelationships
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Ranked AS (
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
               r.UpdatedBy,
               RowRank = ROW_NUMBER() OVER (
                   PARTITION BY r.Name, r.FromObjectType, r.ToObjectType, r.Cardinality
                   ORDER BY r.CreatedAt, r.RelationshipId)
        FROM   dbo.Relationships r
        WHERE  r.IsSystem  = 1
          AND  r.IsRetired = 0
          AND  r.IsDeleted = 0
    )
    SELECT RelationshipId,
           WorkspaceId,
           Name,
           FromObjectType,
           ToObjectType,
           Cardinality,
           FromSideLabel,
           ToSideLabel,
           ShowOnFromAsTab,
           TabLabel,
           SortOrder,
           IsRetired,
           IsSystem,
           CreatedAt,
           UpdatedAt,
           CreatedBy,
           UpdatedBy
    FROM   Ranked
    WHERE  RowRank = 1
    ORDER  BY FromObjectType, SortOrder, Name;
END;
GO
