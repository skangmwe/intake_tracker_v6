-- =============================================
-- Author:      /dev-build-application (Slice 29 — Toolkit object + S43 surface)
-- Create Date: 2026-07-19
-- Description: Returns the single Toolkit item for @RecordId that @UserId is entitled to see —
--              access is baked into the query via a JOIN to WorkspaceMembership (api-record-
--              access.md: detail read paths filter in the query, never fetch-all-then-hide). An item
--              the caller cannot see, or a non-existent id, both return ZERO rows, so the API returns
--              403 uniformly and never discloses record existence (BS §22.6). Any membership level
--              (Viewer+) can read a Toolkit item in its workspace. RowVer is returned for the PATCH
--              ETag. Retired (soft-deleted) items are excluded.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetToolkitItemForUser
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @UserIdLocal   UNIQUEIDENTIFIER = @UserId;

    SELECT
        t.RecordId,
        t.WorkspaceId,
        t.Kind,
        t.Status,
        t.Name,
        t.OneLiner,
        t.Description,
        t.Maintainer,
        t.HowTo,
        t.BodyMarkdown,
        t.AttachmentBlobPath,
        t.AttachmentFileName,
        t.AttachmentContentType,
        t.AttachmentSizeBytes,
        t.CreatedAt,
        t.UpdatedAt,
        t.CreatedBy,
        t.UpdatedBy,
        t.IsDeleted,
        t.RowVer
    FROM dbo.ToolkitItem AS t
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = t.WorkspaceId
       AND m.UserId = @UserIdLocal
       AND m.IsDeleted = 0
    WHERE t.RecordId = @RecordIdLocal
      AND t.IsDeleted = 0;
END;
GO
