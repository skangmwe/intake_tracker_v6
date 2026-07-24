-- =============================================
-- Author:      surface-fields (Toolkit item field surfacing — export)
-- Create Date: 2026-07-23
-- Description: Lists every toolkit item in a workspace, paginated, for the Toolkit CSV export
--              (S28 export wizard). One row per item with all user-meaningful columns — kind,
--              status, name, one-liner, description, maintainer, how-to, body, whether it carries
--              an attachment (+ the attachment file name), last-updated, and the updater's resolved
--              display name (LEFT JOIN dbo.Users on the audit actor id).
--
--              Access: NOT an access-gate proc. ExportService gates the caller's Viewer membership
--              on @WorkspaceId before the export path runs (api-record-access.md — the workspace
--              scope IS the row-level entitlement; export never widens access, BS §22.4). Soft-
--              deleted rows excluded. Blob path is never surfaced.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetToolkitForWorkspace
    @WorkspaceId UNIQUEIDENTIFIER,
    @Page        INT,
    @PageSize    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Skip INT = (@Page - 1) * @PageSize;
    DECLARE @Take INT = @PageSize;

    SELECT
        t.RecordId,
        t.Kind,
        t.Status,
        t.Name,
        t.OneLiner,
        t.Description,
        t.Maintainer,
        t.HowTo,
        t.BodyMarkdown,
        t.AttachmentFileName,
        CAST(CASE WHEN t.AttachmentBlobPath IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS HasAttachment,
        t.UpdatedAt,
        u.DisplayName AS UpdatedByName
    FROM dbo.ToolkitItem AS t
    LEFT JOIN dbo.Users AS u
        ON u.UserId = TRY_CAST(t.UpdatedBy AS UNIQUEIDENTIFIER) AND u.IsDeleted = 0
    WHERE t.WorkspaceId = @Ws
      AND t.IsDeleted = 0
    ORDER BY t.Name ASC, t.RecordId ASC
    OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
END;
GO
