-- =============================================
-- Author:      /dev-build-application (Slice 11 — Attachments)
-- Create Date: 2026-07-05
-- Description: Records one attachment row (native upload or external link) on a record, gating
--              write access on the caller's membership of the record's workspace (api-record-
--              access.md — defense in depth; the API already verified edit access before
--              streaming the blob). A caller who is not a member inserts ZERO rows and @Inserted
--              returns 0, so the API answers 403 without disclosing record existence (BS §22.6).
--
--              @AttachmentId + @BlobPath are server-allocated API-side BEFORE the upload
--              (api-blob-attachments.md — the blob name is an opaque, server-allocated GUID
--              written to SQL). For an external link @IsLink = 1, @ExternalUrl is set, and
--              @BlobPath is a never-streamed sentinel. The row is the authoritative pointer;
--              access is never derived from the path. Returns @Inserted (no result set).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateAttachment
    @AttachmentId UNIQUEIDENTIFIER,
    @RecordId     NVARCHAR(20),
    @WorkspaceId  UNIQUEIDENTIFIER,
    @FileName     NVARCHAR(400),
    @ContentType  NVARCHAR(200),
    @SizeBytes    BIGINT,
    @BlobPath     NVARCHAR(1024),
    @IsLink       BIT,
    @ExternalUrl  NVARCHAR(2048),
    @ActorUserId  UNIQUEIDENTIFIER,
    @Inserted     BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id       UNIQUEIDENTIFIER = @AttachmentId;
    DECLARE @Record   NVARCHAR(20)     = @RecordId;
    DECLARE @Ws       UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Name     NVARCHAR(400)    = @FileName;
    DECLARE @Type     NVARCHAR(200)    = @ContentType;
    DECLARE @Size     BIGINT           = @SizeBytes;
    DECLARE @Path     NVARCHAR(1024)   = @BlobPath;
    DECLARE @Link     BIT              = @IsLink;
    DECLARE @Url      NVARCHAR(2048)   = @ExternalUrl;
    DECLARE @Actor    UNIQUEIDENTIFIER = @ActorUserId;
    DECLARE @ActorStr NVARCHAR(256)    = CAST(@ActorUserId AS NVARCHAR(256));

    SET @Inserted = 0;

    -- Access gate: the record must exist on a workspace the caller is a member of.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @Actor AND m.IsDeleted = 0
        WHERE r.RecordId = @Record
          AND r.WorkspaceId = @Ws
          AND r.IsDeleted = 0)
        RETURN;

    INSERT INTO dbo.Attachments
        (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes,
         BlobPath, IsLink, ExternalUrl, CreatedBy, UpdatedBy)
    VALUES
        (@Id, @Record, N'Request', @Ws, @Name, @Type, @Size,
         @Path, @Link, @Url, @ActorStr, @ActorStr);

    SET @Inserted = 1;
END;
GO
