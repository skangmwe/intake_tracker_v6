-- =============================================
-- Author:      /dev-build-application (Slice 11 — Attachments)
-- Create Date: 2026-07-05
-- Description: Soft-deletes an attachment (IsDeleted = 1), gating on the caller's membership of the
--              attachment's workspace (api-record-access.md). A forbidden OR non-existent (or
--              already-deleted) attachment updates ZERO rows and @Deleted returns 0, so the API
--              answers 403 without disclosing existence (BS §22.6). The blob is retained until a
--              retention policy fires (out of scope, api-blob-attachments.md). Returns @Deleted
--              (no result set).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeleteAttachment
    @AttachmentId UNIQUEIDENTIFIER,
    @ActorUserId  UNIQUEIDENTIFIER,
    @Deleted      BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id       UNIQUEIDENTIFIER = @AttachmentId;
    DECLARE @Actor    UNIQUEIDENTIFIER = @ActorUserId;
    DECLARE @ActorStr NVARCHAR(256)    = CAST(@ActorUserId AS NVARCHAR(256));
    DECLARE @Now      DATETIME2        = SYSUTCDATETIME();

    SET @Deleted = 0;

    UPDATE a
    SET a.IsDeleted = 1,
        a.DeletedAt = @Now,
        a.UpdatedAt = @Now,
        a.UpdatedBy = @ActorStr
    FROM dbo.Attachments AS a
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = a.WorkspaceId AND m.UserId = @Actor AND m.IsDeleted = 0
    WHERE a.AttachmentId = @Id
      AND a.IsDeleted = 0;

    IF @@ROWCOUNT > 0
        SET @Deleted = 1;
END;
GO
