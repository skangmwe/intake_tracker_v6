-- =============================================
-- Author:      /dev-build-application (Slice 29 — Toolkit object + S43 surface)
-- Create Date: 2026-07-19
-- Description: Creates a Toolkit item (build spec §2.6 / §19). Mints the record ID under the item's
--              home workspace counter (usp_MintRecordId) and inserts one row, inside a single
--              transaction so a failed insert never burns a sequence number. Origin is resolved from
--              the minted prefix (usp_ResolveOrigin). Attachment columns are set only when the caller
--              streamed a file to blob first (the API passes the blob pointer + metadata). Membership
--              (Member+) is verified API-side before this runs. Returns the new RecordId via OUTPUT
--              (no result set — the caller re-reads via usp_GetToolkitItemForUser).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateToolkitItem
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
    @ActorUserId           NVARCHAR(256),
    @RecordId              NVARCHAR(20)   OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws        UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @KindLocal NVARCHAR(20)     = @Kind;
    DECLARE @StatusL   NVARCHAR(20)     = ISNULL(@Status, N'Draft');
    DECLARE @NameLocal NVARCHAR(200)    = @Name;
    DECLARE @Actor     NVARCHAR(256)    = @ActorUserId;
    DECLARE @Origin    NVARCHAR(200);
    DECLARE @OriginWs  UNIQUEIDENTIFIER;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Mint inside the transaction so a failed insert rolls the counter back.
        EXEC dbo.usp_MintRecordId @WorkspaceId = @Ws, @RecordId = @RecordId OUTPUT;

        -- Origin = the minting workspace's name at mint time (resolved from the prefix).
        EXEC dbo.usp_ResolveOrigin @RecordId = @RecordId,
             @WorkspaceId = @OriginWs OUTPUT, @WorkspaceNameAtMint = @Origin OUTPUT;

        INSERT INTO dbo.ToolkitItem
            (RecordId, WorkspaceId, Origin, Kind, Status, Name, OneLiner, Description, Maintainer,
             HowTo, BodyMarkdown, AttachmentBlobPath, AttachmentFileName, AttachmentContentType,
             AttachmentSizeBytes, CreatedBy, UpdatedBy)
        VALUES
            (@RecordId, @Ws, @Origin, @KindLocal, @StatusL, @NameLocal, @OneLiner, @Description, @Maintainer,
             @HowTo, @BodyMarkdown, @AttachmentBlobPath, @AttachmentFileName, @AttachmentContentType,
             @AttachmentSizeBytes, @Actor, @Actor);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
