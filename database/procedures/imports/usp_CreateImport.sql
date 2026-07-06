-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Records one import job (Status='Processing') after the CSV has streamed to Blob,
--              gating write access on the caller being a WorkspaceAdmin of the target workspace
--              (BS §13 — import is admin-only; api-record-access.md — defense in depth behind the
--              controller's IAccessGuard check). A non-admin (or unknown workspace) inserts ZERO
--              rows and @Created returns 0, so the API answers 403 without disclosing existence
--              (BS §22.6) and deletes the orphaned CSV blob.
--
--              @ImportId + @BlobPath are server-allocated API-side BEFORE the row is written (the
--              blob name is an opaque server GUID, api-blob-attachments.md). StartedBy is the
--              importing admin — also the Requestor fallback per row (BS §13). Returns @Created
--              (no result set).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateImport
    @ImportId        UNIQUEIDENTIFIER,
    @WorkspaceId     UNIQUEIDENTIFIER,
    @FileName        NVARCHAR(400),
    @BlobPath        NVARCHAR(1024),
    @StartedByUserId UNIQUEIDENTIFIER,
    @Created         BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id       UNIQUEIDENTIFIER = @ImportId;
    DECLARE @Ws       UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Name     NVARCHAR(400)    = @FileName;
    DECLARE @Path     NVARCHAR(1024)   = @BlobPath;
    DECLARE @Actor    UNIQUEIDENTIFIER = @StartedByUserId;
    DECLARE @ActorStr NVARCHAR(256)    = CAST(@StartedByUserId AS NVARCHAR(256));

    SET @Created = 0;

    -- Access gate: the caller must be a WorkspaceAdmin of the target workspace.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.WorkspaceMembership AS m
        WHERE m.WorkspaceId = @Ws
          AND m.UserId = @Actor
          AND m.Level = N'WorkspaceAdmin'
          AND m.IsDeleted = 0)
        RETURN;

    INSERT INTO dbo.Imports
        (ImportId, WorkspaceId, FileName, BlobPath, Status, StartedByUserId, CreatedBy, UpdatedBy)
    VALUES
        (@Id, @Ws, @Name, @Path, N'Processing', @Actor, @ActorStr, @ActorStr);

    SET @Created = 1;
END;
GO
