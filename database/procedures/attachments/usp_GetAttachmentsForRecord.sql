-- =============================================
-- Author:      /dev-build-application (Slice 11 — Attachments)
-- Create Date: 2026-07-05
-- Description: Lists the attachments on a record for a caller (the Attachments card). Access is
--              baked into the query via a JOIN to WorkspaceMembership on the attachment's own
--              WorkspaceId (api-record-access.md — filter in the query, never fetch-all-then-hide),
--              so a caller sees only the side(s) of the record they belong to, and a non-member
--              (or a non-existent record) gets ZERO rows — the API answers 403 uniformly without
--              disclosing existence (BS §22.6). Soft-deleted rows are excluded. BlobPath is NOT
--              returned (the pointer is never surfaced to the client; downloads go through
--              usp_GetAttachmentById). Newest first.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetAttachmentsForRecord
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;

    SELECT
        a.AttachmentId,
        a.RecordId,
        a.ObjectType,
        a.WorkspaceId,
        a.FileName,
        a.ContentType,
        a.SizeBytes,
        a.IsLink,
        a.ExternalUrl,
        a.CreatedAt,
        a.CreatedBy
    FROM dbo.Attachments AS a
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = a.WorkspaceId
       AND m.UserId = @User
       AND m.IsDeleted = 0
    WHERE a.RecordId = @Record
      AND a.IsDeleted = 0
    ORDER BY a.CreatedAt DESC;
END;
GO
