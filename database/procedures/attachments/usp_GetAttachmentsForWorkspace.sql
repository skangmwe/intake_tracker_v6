-- =============================================
-- Author:      surface-fields (Attachment field surfacing — export)
-- Create Date: 2026-07-23
-- Description: Lists every attachment in a workspace, paginated, for the Attachment CSV export
--              (S28 export wizard). One row per attachment with its parent record + type, file
--              metadata (name / content-type / size), link vs file, external URL, upload date, and
--              the uploader's resolved display name (LEFT JOIN dbo.Users on the audit actor id, so
--              a seeded / non-user actor still exports with a null name).
--
--              Access: NOT an access-gate proc. ExportService gates the caller's Viewer membership
--              on @WorkspaceId before the export path runs (api-record-access.md — the workspace
--              scope IS the row-level entitlement; export never widens access, BS §22.4). Soft-
--              deleted rows excluded. BlobPath is never surfaced. File names are Confidential-
--              adjacent — never logged (api-pii-handling.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetAttachmentsForWorkspace
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
        a.AttachmentId,
        a.RecordId,
        a.ObjectType,
        a.FileName,
        a.ContentType,
        a.SizeBytes,
        a.IsLink,
        a.ExternalUrl,
        a.CreatedAt,
        u.DisplayName AS UploadedByName
    FROM dbo.Attachments AS a
    LEFT JOIN dbo.Users AS u
        ON u.UserId = TRY_CAST(a.CreatedBy AS UNIQUEIDENTIFIER) AND u.IsDeleted = 0
    WHERE a.WorkspaceId = @Ws
      AND a.IsDeleted = 0
    ORDER BY a.CreatedAt DESC, a.AttachmentId ASC
    OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
END;
GO
