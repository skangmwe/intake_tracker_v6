-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Lists the SavedViews the caller can see on one list surface — every shared view in
--              the workspace plus the caller's own personal views (BS §22.3). Workspace membership
--              is verified API-side before this runs; the personal/shared visibility rule is the
--              access boundary applied here. Scoped by (workspace, object type) so a Request view
--              never appears on the Features picker. Ordered by name for a stable picker.
--
--              Updated 2026-07-27 — @ObjectType widened NVARCHAR(16) -> NVARCHAR(64) to match the
--              SavedView.ObjectType column (migration 086) so a custom slug > 16 chars matches its
--              rows instead of silently truncating the filter to 16 chars (matching nothing / wrong rows).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListSavedViews
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(64),
    @UserId      UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws      UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjType NVARCHAR(64)     = @ObjectType;
    DECLARE @User    UNIQUEIDENTIFIER = @UserId;

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
    WHERE sv.WorkspaceId = @Ws
      AND sv.ObjectType = @ObjType
      AND sv.IsDeleted = 0
      AND (sv.Scope = N'shared' OR (sv.Scope = N'personal' AND sv.OwnerUserId = @User))
    ORDER BY sv.Name ASC, sv.SavedViewId ASC;
END;
GO
