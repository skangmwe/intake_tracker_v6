-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core; Slice 26 — hold guard)
-- Create Date: 2026-07-04
-- Last update: 2026-07-21 (close/status cleanup — hold guard: StatusHold = OnHold blocks advance; Abandoned retired)
-- Description: Advances (or moves) a Request to a target lifecycle stage. Validates that
--              @ToStage is a real StageKey on the record's OWN lifecycle (THROW 50041 otherwise),
--              then sets Stage and mirrors it into the field map (so Display/Mirror Status derive
--              correctly). Slice 5 does NOT wire gates — gate firing on a gated transition is
--              added in slice 8; here every transition simply applies. No result set — the caller
--              re-reads. Workspace level is checked API-side before this runs.
--
--              Slice 26 (D3): a held record cannot advance stages. The guard fires after
--              existence lookup so we do not disclose a non-existent record via 51201 vs 50043.
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
    DECLARE @StatusHoldNow NVARCHAR(20);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @LifecycleId  = LifecycleId,
               @StatusHoldNow = StatusHold
        FROM dbo.Requests WITH (UPDLOCK, ROWLOCK)
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        IF @LifecycleId IS NULL
            THROW 50043, N'usp_SetRequestStage: request not found.', 1;

        -- Slice 26 hold guard: held records cannot advance stages.
        IF @StatusHoldNow = N'OnHold'
            THROW 51201, N'usp_SetRequestStage: this record is on hold. Reactivate it before advancing.', 1;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.StageDefinition
            WHERE LifecycleId = @LifecycleId AND StageKey = @ToStageLocal AND IsDeleted = 0)
            THROW 50041, N'usp_SetRequestStage: target stage is not part of the record''s lifecycle.', 1;

        -- StageEnteredAt resets to now ONLY when the stage actually changes (BS §10.6): a no-op
        -- set to the current stage must not restart the time-in-stage clock.
        UPDATE dbo.Requests
        SET Stage          = @ToStageLocal,
            StageEnteredAt  = CASE WHEN Stage <> @ToStageLocal OR StageEnteredAt IS NULL
                                   THEN SYSUTCDATETIME() ELSE StageEnteredAt END,
            FieldValues     = JSON_MODIFY(FieldValues, N'$.stage', @ToStageLocal),
            UpdatedBy       = @Actor,
            UpdatedAt       = SYSUTCDATETIME()
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
