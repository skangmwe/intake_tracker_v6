-- =============================================
-- Author:      /dev-build-application (Slice: triggers-request-authoring, Task 2.1)
-- Create Date: 2026-07-24
-- Description: Soft-delete one trigger and its conditions, scoped to the workspace (cross-workspace
--              deletes are ignored). Returns the number of trigger rows affected (0 = not found in the
--              workspace) so the caller can map to 404 vs 204.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeleteScheduledTrigger
    @TriggerId   UNIQUEIDENTIFIER,
    @WorkspaceId UNIQUEIDENTIFIER,
    @By          NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Trigger UNIQUEIDENTIFIER = @TriggerId;
    DECLARE @Ws      UNIQUEIDENTIFIER = @WorkspaceId;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.ScheduledTrigger
        SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @By
        WHERE TriggerId = @Trigger AND WorkspaceId = @Ws AND IsDeleted = 0;

        DECLARE @Affected INT = @@ROWCOUNT;

        IF @Affected > 0
            UPDATE dbo.ScheduledTriggerCondition
            SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @By
            WHERE TriggerId = @Trigger AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT @Affected AS RowsAffected;
END;
GO
