-- =============================================
-- Author:      /dev-build-application (Slice 29 — Toolkit object + S43 surface)
-- Create Date: 2026-07-19
-- Description: Updates a Toolkit item's editable fields. The API reads the current row, applies the
--              sparse patch (and any new/removed attachment), then passes the full resolved column set
--              here. Optimistic concurrency: the caller passes the RowVer it last read as
--              @IfMatchRowVer; if the row's current RowVer differs, the proc THROWs 50040 (stale →
--              API 409). Missing row THROWs 50043 (not found → API 403). No result set — the caller
--              re-reads via usp_GetToolkitItemForUser. Membership (Member+) is verified API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_PatchToolkitItem
    @RecordId              NVARCHAR(20),
    @WorkspaceId           UNIQUEIDENTIFIER,
    @Kind                  NVARCHAR(20),
    @Status                NVARCHAR(20),
    @Name                  NVARCHAR(200),
    @OneLiner              NVARCHAR(300)  = NULL,
    @Description           NVARCHAR(2000) = NULL,
    @Maintainer            NVARCHAR(200)  = NULL,
    @HowTo                 NVARCHAR(2000) = NULL,
    @BodyMarkdown          NVARCHAR(MAX)  = NULL,
    @AttachmentBlobPath    NVARCHAR(400)  = NULL,
    @AttachmentFileName    NVARCHAR(400)  = NULL,
    @AttachmentContentType NVARCHAR(200)  = NULL,
    @AttachmentSizeBytes   BIGINT         = NULL,
    @IfMatchRowVer         VARBINARY(8),
    @ActorUserId           NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @Ws            UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @IfMatch       VARBINARY(8)     = @IfMatchRowVer;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;
    DECLARE @CurrentRowVer VARBINARY(8);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @CurrentRowVer = RowVer
        FROM dbo.ToolkitItem WITH (UPDLOCK, ROWLOCK)
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        IF @CurrentRowVer IS NULL
            THROW 50043, N'usp_PatchToolkitItem: item not found.', 1;

        IF @IfMatch IS NULL OR @CurrentRowVer <> @IfMatch
            THROW 50040, N'usp_PatchToolkitItem: the record was modified by someone else (stale ETag).', 1;

        UPDATE dbo.ToolkitItem
        SET Kind                  = @Kind,
            Status                = @Status,
            Name                  = @Name,
            OneLiner              = @OneLiner,
            Description           = @Description,
            Maintainer            = @Maintainer,
            HowTo                 = @HowTo,
            BodyMarkdown          = @BodyMarkdown,
            AttachmentBlobPath    = @AttachmentBlobPath,
            AttachmentFileName    = @AttachmentFileName,
            AttachmentContentType = @AttachmentContentType,
            AttachmentSizeBytes   = @AttachmentSizeBytes,
            UpdatedBy             = @Actor,
            UpdatedAt             = SYSUTCDATETIME()
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
