-- =============================================
-- Author:      /dev-build-application (Slice 26 — Record Status/hold model)
-- Create Date: 2026-07-17
-- Description: Rollback for 20260717_061_BackfillStatusHoldFromJson. Resets the
--              backfilled rows back to the column defaults (StatusHold='InProgress',
--              StatusHoldNote=NULL). Because the JSON keys (`$.holdBlocked`,
--              `$.holdReason`) were LEFT IN PLACE by 061, no JSON edit is required
--              here — re-running 061 would restore the values from the untouched JSON.
--
--              Idempotent. Rolls back only the derived column values, not the JSON
--              keys or the migration-history rows for other migrations.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.Requests
       SET StatusHold     = N'InProgress',
           StatusHoldNote = NULL,
           UpdatedAt      = SYSUTCDATETIME(),
           UpdatedBy      = N'system-migration'
     WHERE IsDeleted  = 0
       AND (StatusHold <> N'InProgress' OR StatusHoldNote IS NOT NULL);

    DELETE FROM dbo.MigrationHistory
     WHERE MigrationId = N'20260717_061_BackfillStatusHoldFromJson';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
