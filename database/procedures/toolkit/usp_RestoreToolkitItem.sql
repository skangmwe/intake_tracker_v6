-- =============================================
-- Author:      /dev-build-application (Slice 29 — Toolkit object + S43 surface)
-- Create Date: 2026-07-19
-- Description: Restores a retired Toolkit item (un-soft-delete). Self-gating on membership because a
--              retired row is excluded from the read paths — the UPDATE only fires when @UserId is a
--              Member+ of the item's workspace (api-record-access.md). @Restored OUTPUT is 1 when a
--              retired row was restored, 0 otherwise (missing, already live, or forbidden) → the API
--              maps 0 to 403 without disclosing existence. Idempotent: a second call on an already-live
--              item returns @Restored = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RestoreToolkitItem
    @RecordId    NVARCHAR(20),
    @UserId      UNIQUEIDENTIFIER,
    @ActorUserId NVARCHAR(256),
    @Restored    BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @UserIdLocal   UNIQUEIDENTIFIER = @UserId;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;

    SET @Restored = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE t
        SET t.IsDeleted = 0,
            t.DeletedAt = NULL,
            t.UpdatedBy = @Actor,
            t.UpdatedAt = SYSUTCDATETIME()
        FROM dbo.ToolkitItem AS t
        WHERE t.RecordId = @RecordIdLocal
          AND t.IsDeleted = 1
          AND EXISTS (
                SELECT 1 FROM dbo.WorkspaceMembership AS m
                WHERE m.WorkspaceId = t.WorkspaceId
                  AND m.UserId = @UserIdLocal
                  AND m.Level IN (N'Member', N'WorkspaceAdmin')
                  AND m.IsDeleted = 0);

        SET @Restored = CASE WHEN @@ROWCOUNT > 0 THEN 1 ELSE 0 END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
