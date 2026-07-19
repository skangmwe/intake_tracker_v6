-- =============================================
-- Author:      /dev-build-application (Slice 29 — Toolkit object + S43 surface)
-- Create Date: 2026-07-19
-- Description: Soft-deletes (retires) a Toolkit item. Self-gating on membership so it also resolves
--              correctly regardless of read-path filters: the UPDATE only fires when @UserId is a
--              Member+ of the item's workspace (api-record-access.md — the same access check on every
--              mutation path). @Retired OUTPUT is 1 when a live row was retired, 0 otherwise (missing,
--              already retired, or forbidden) → the API maps 0 to 403 without disclosing existence.
--              Retire is idempotent: a second call on an already-retired item returns @Retired = 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RetireToolkitItem
    @RecordId    NVARCHAR(20),
    @UserId      UNIQUEIDENTIFIER,
    @ActorUserId NVARCHAR(256),
    @Retired     BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @UserIdLocal   UNIQUEIDENTIFIER = @UserId;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;

    SET @Retired = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE t
        SET t.IsDeleted = 1,
            t.DeletedAt = SYSUTCDATETIME(),
            t.UpdatedBy = @Actor,
            t.UpdatedAt = SYSUTCDATETIME()
        FROM dbo.ToolkitItem AS t
        WHERE t.RecordId = @RecordIdLocal
          AND t.IsDeleted = 0
          AND EXISTS (
                SELECT 1 FROM dbo.WorkspaceMembership AS m
                WHERE m.WorkspaceId = t.WorkspaceId
                  AND m.UserId = @UserIdLocal
                  AND m.Level IN (N'Member', N'WorkspaceAdmin')
                  AND m.IsDeleted = 0);

        SET @Retired = CASE WHEN @@ROWCOUNT > 0 THEN 1 ELSE 0 END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
