-- =============================================
-- Author:      /dev-build-application (Slice 26 — Record Status/hold model)
-- Create Date: 2026-07-17
-- Description: DATA migration. Backfills dbo.Requests.StatusHold and StatusHoldNote from
--              the pre-Slice-26 JSON keys inside FieldValues (`$.holdBlocked`, `$.holdReason`).
--              See v2-reconciliation.md §Model deltas 3.
--
--              Backfill rule (Slice 26 cut plan D1 — leave JSON keys in place, mirror on
--              write): rows where `$.holdBlocked` is (case-insensitively) the string 'true'
--              become StatusHold='OnHold' with any `$.holdReason` copied to StatusHoldNote.
--              All other rows (including missing key, 'false', or non-'true' values)
--              remain StatusHold='InProgress' (the column default) with a NULL note.
--
--              Abandoned is a NEW state introduced by Slice 26 — no pre-Slice-26 row can
--              be Abandoned, so this migration never sets that value.
--
--              The JSON keys are LEFT IN PLACE by design (D1). usp_UpsertRequestStatusHold
--              (Slice 26) mirrors StatusHold ↔ JSON on every write so the condition
--              engine's Display/Mirror Status derivation (which reads `$.holdBlocked`) keeps
--              seeing consistent values. Idempotent — a re-run only updates rows whose
--              StatusHold does not already reflect the JSON.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.Requests
       SET StatusHold     = N'OnHold',
           StatusHoldNote = NULLIF(LTRIM(RTRIM(ISNULL(JSON_VALUE(FieldValues, N'$.holdReason'), N''))), N''),
           UpdatedAt      = SYSUTCDATETIME(),
           UpdatedBy      = N'system-migration'
     WHERE IsDeleted  = 0
       AND StatusHold = N'InProgress'
       AND LOWER(ISNULL(JSON_VALUE(FieldValues, N'$.holdBlocked'), N'')) = N'true';

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260717_061_BackfillStatusHoldFromJson')
    BEGIN
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260717_061_BackfillStatusHoldFromJson', SUSER_SNAME(),
                N'Slice 26 — backfill Requests.StatusHold from FieldValues JSON keys.');
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
