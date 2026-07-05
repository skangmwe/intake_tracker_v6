-- =============================================
-- Author:      /dev-build-application (Slice 11 — Attachments)
-- Create Date: 2026-07-05
-- Description: Resolves a single attachment for download, gating on the caller's membership of the
--              attachment's workspace (api-record-access.md). A forbidden OR non-existent (or
--              soft-deleted) attachment returns ZERO rows, so the API answers 403 without
--              disclosing existence (BS §22.6). Returns the BlobPath + FileName + ContentType so
--              the API can stream the bytes with the correct Content-Disposition; the client never
--              sees the path. External links (IsLink = 1) carry ExternalUrl instead of a streamable
--              blob — the API redirects rather than streams.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetAttachmentById
    @AttachmentId UNIQUEIDENTIFIER,
    @UserId       UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id   UNIQUEIDENTIFIER = @AttachmentId;
    DECLARE @User UNIQUEIDENTIFIER = @UserId;

    SELECT
        a.AttachmentId,
        a.RecordId,
        a.WorkspaceId,
        a.FileName,
        a.ContentType,
        a.SizeBytes,
        a.BlobPath,
        a.IsLink,
        a.ExternalUrl
    FROM dbo.Attachments AS a
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = a.WorkspaceId
       AND m.UserId = @User
       AND m.IsDeleted = 0
    WHERE a.AttachmentId = @Id
      AND a.IsDeleted = 0;
END;
GO
