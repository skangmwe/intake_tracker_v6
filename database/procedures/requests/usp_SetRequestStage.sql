-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Advances (or moves) a Request to a target lifecycle stage. Validates that
--              @ToStage is a real StageKey on the record's OWN lifecycle (THROW 50041 otherwise),
--              then sets Stage and mirrors it into the field map (so Display/Mirror Status derive
--              correctly). Slice 5 does NOT wire gates — gate firing on a gated transition is
--              added in slice 8; here every transition simply applies. No result set — the caller
--              re-reads. Workspace level is checked API-side before this runs.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SetRequestStage
    @RecordId    NVARCHAR(20),
    @WorkspaceId UNIQUEIDENTIFIER,
    @ToStage     NVARCHAR(64),
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @Ws            UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ToStageLocal  NVARCHAR(64)     = @ToStage;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;
    DECLARE @LifecycleId   UNIQUEIDENTIFIER;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @LifecycleId = LifecycleId
        FROM dbo.Requests WITH (UPDLOCK, ROWLOCK)
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        IF @LifecycleId IS NULL
            THROW 50043, N'usp_SetRequestStage: request not found.', 1;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.StageDefinition
            WHERE LifecycleId = @LifecycleId AND StageKey = @ToStageLocal AND IsDeleted = 0)
            THROW 50041, N'usp_SetRequestStage: target stage is not part of the record''s lifecycle.', 1;

        UPDATE dbo.Requests
        SET Stage       = @ToStageLocal,
            FieldValues = JSON_MODIFY(FieldValues, N'$.stage', @ToStageLocal),
            UpdatedBy   = @Actor,
            UpdatedAt   = SYSUTCDATETIME()
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
