-- =============================================
-- Author:      lifecycle rename — default lifecycle Name "Standard AI build" -> "Standard delivery"
-- Create Date: 2026-07-21
-- Description: DATA migration. Renames the seeded default lifecycle's user-facing Name from
--              "Standard AI build" to "Standard delivery" on the AI Solutions workspace. The
--              stage vocabulary was already renamed to the delivery flow (067/070/072); this
--              aligns the lifecycle's own display label with it. Targets the fixed seed
--              LifecycleId (11FE0000-…-000000000001) and guards on the current Name so a re-run
--              is a no-op. RequestType ("Full build") is legacy/non-user-facing (v2 dropped it as
--              a surface label — see LifecycleSummaryDto) and is intentionally left unchanged.
--              Follows the forward-migration pattern of 067/072 — the historical seed (028) is
--              not edited. Idempotent — the old Name is absent after the first run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Lc   UNIQUEIDENTIFIER = N'11FE0000-0000-4000-8000-000000000001'; -- default lifecycle
DECLARE @Seed NVARCHAR(256)    = N'system-seed';
DECLARE @Now  DATETIME2        = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.Lifecycle
    SET Name = N'Standard delivery', UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE LifecycleId = @Lc AND Name = N'Standard AI build';

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_074_RenameDefaultLifecycleToStandardDelivery')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260721_074_RenameDefaultLifecycleToStandardDelivery', SUSER_SNAME(), N'Rename default lifecycle Name Standard AI build -> Standard delivery.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
