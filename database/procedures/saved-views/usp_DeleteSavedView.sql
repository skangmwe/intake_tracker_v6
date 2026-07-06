-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Soft-deletes a SavedView (BS §22.4 — deleting a view never touches records). The
--              authorization decision (owner for a personal view, WorkspaceAdmin for a shared one)
--              is enforced API-side before this runs. Idempotent — deleting an already-deleted or
--              unknown view is a no-op. Presentation-only object; no event/audit emitted here.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeleteSavedView
    @SavedViewId UNIQUEIDENTIFIER,
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IdLocal UNIQUEIDENTIFIER = @SavedViewId;
    DECLARE @Actor   NVARCHAR(256)    = @ActorUserId;

    UPDATE dbo.SavedView
    SET IsDeleted = 1,
        DeletedAt = SYSUTCDATETIME(),
        UpdatedBy = @Actor,
        UpdatedAt = SYSUTCDATETIME()
    WHERE SavedViewId = @IdLocal AND IsDeleted = 0;
END;
GO
