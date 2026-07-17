-- =============================================
-- Author:      /dev-build-application (Slice 25 — Object-level Relationships)
-- Create Date: 2026-07-16
-- Description: Returns one Relationship row by id (v2-reconciliation.md §API deltas
--              Relationships GET /relationships/{id}). Empty result set → controller
--              treats as 404 (or 403 if the caller can't see the workspace — that check
--              runs at the controller before this proc is called).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetRelationshipById
    @RelationshipId UNIQUEIDENTIFIER,
    @WorkspaceId    UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Id UNIQUEIDENTIFIER = @RelationshipId;
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
    WHERE  r.RelationshipId = @Id
      AND  r.WorkspaceId    = @Ws
      AND  r.IsDeleted      = 0;
END;
GO
