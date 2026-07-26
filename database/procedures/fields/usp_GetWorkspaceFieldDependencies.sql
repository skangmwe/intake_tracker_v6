-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Returns the full field-rule dependency edge list for one
--              (WorkspaceId, ObjectType). The API's ConditionEngine reads this to run the
--              acyclic + depth<=3 check at save (§3.1) BEFORE persisting a field change.
--              Soft-deleted edges excluded. Read-only projection.
--
--              Updated 2026-07-26 (SP3b Slice 2a, Task 3) — also returns a Global field's
--              dependency edges (WorkspaceId IS NULL — see migration 102) alongside the
--              caller's own, so the graph check a Global field's save runs (ReadDependenciesAsync
--              called with @WorkspaceId=Guid.Empty, which owns no rows) sees existing Global
--              edges, and a workspace's own graph check inherits the Global edges it can
--              reference (mirrors usp_GetWorkspaceFields' Location='Global' inheritance).
--              FieldRuleDependency has no Location column, so a NULL WorkspaceId is
--              unambiguously a Global field's edge — the additive OR cannot pick up a
--              mislabelled tenant row the way a Location-based predicate could.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFieldDependencies
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(64)     = @ObjectType;

    SELECT
        e.FromFieldKey AS FromFieldKey,
        e.ToFieldKey   AS ToFieldKey
    FROM dbo.FieldRuleDependency AS e
    WHERE (e.WorkspaceId = @WorkspaceIdLocal OR e.WorkspaceId IS NULL)
      AND e.ObjectType = @ObjectTypeLocal
      AND e.IsDeleted = 0;
END;
GO
