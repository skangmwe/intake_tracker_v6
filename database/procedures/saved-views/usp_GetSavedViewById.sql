-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Returns a single SavedView by id (not deleted). The API reads this to authorize an
--              edit/delete (personal view → the owner; shared view → a WorkspaceAdmin) and to
--              surface the DTO. Returns ZERO rows for an unknown/deleted id so the API returns 404
--              (a saved view is not access-scoped by existence the way records are — it is metadata
--              over an already access-filtered surface). Visibility is enforced by the caller.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetSavedViewById
    @SavedViewId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IdLocal UNIQUEIDENTIFIER = @SavedViewId;

    SELECT
        sv.SavedViewId,
        sv.WorkspaceId,
        sv.ObjectType,
        sv.Name,
        sv.Scope,
        sv.OwnerUserId,
        sv.IsDefault,
        sv.ColumnsJson,
        sv.FiltersJson,
        sv.SortJson,
        sv.CreatedBy,
        sv.CreatedAt,
        sv.UpdatedAt
    FROM dbo.SavedView AS sv
    WHERE sv.SavedViewId = @IdLocal
      AND sv.IsDeleted = 0;
END;
GO
