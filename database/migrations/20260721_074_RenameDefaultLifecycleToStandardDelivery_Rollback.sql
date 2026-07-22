-- =============================================
-- Author:      lifecycle rename ROLLBACK — default lifecycle Name "Standard delivery" -> "Standard AI build"
-- Create Date: 2026-07-21
-- Description: Reverses 20260721_074. Restores the seeded default lifecycle's Name to
--              "Standard AI build" and removes the migration-history row. Targets the fixed seed
--              LifecycleId and guards on the current Name so a re-run is a no-op. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Lc   UNIQUEIDENTIFIER = N'11FE0000-0000-4000-8000-000000000001'; -- default lifecycle
DECLARE @Seed NVARCHAR(256)    = N'system-seed';
DECLARE @Now  DATETIME2        = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.Lifecycle
    SET Name = N'Standard AI build', UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE LifecycleId = @Lc AND Name = N'Standard delivery';

    DELETE FROM dbo.MigrationHistory
    WHERE MigrationId = N'20260721_074_RenameDefaultLifecycleToStandardDelivery';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
