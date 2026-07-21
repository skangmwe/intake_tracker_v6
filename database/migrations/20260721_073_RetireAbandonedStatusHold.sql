-- =============================================
-- Author:      close/status cleanup — retire the 'Abandoned' status-hold value
-- Create Date: 2026-07-21
-- Description: DATA + constraint migration. The record Status control is unified with the Close
--              action (grouped Active/Closed picker), and the 'Abandoned' hold state — which
--              overlapped the 'Withdrawn'/'Not pursued' close outcomes — is retired. Any existing
--              record that is Abandoned is CLOSED with outcome 'NotPursued' (local), carrying its
--              hold note forward as the outcome note, and returned to StatusHold='InProgress'
--              (a closed record is no longer "held"). The legacy FieldValues hold keys
--              ($.holdBlocked / $.holdReason) are cleared on those rows.
--
--              Order matters: the per-record remap runs BEFORE tightening CK_Requests_StatusHold,
--              so no 'Abandoned' rows remain when the constraint is narrowed to (InProgress, OnHold).
--              The filtered index IX_Requests_Workspace_StatusHold (WHERE StatusHold <> 'InProgress')
--              needs no change — remapped rows simply drop out of it.
--
--              Idempotent — no 'Abandoned' rows remain and the CHECK re-add is guarded after the
--              first run. Forward-only for the data (rollback restores the constraint but cannot
--              re-identify which rows were originally Abandoned — see the rollback header).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    -- ── 1) Close existing Abandoned records as 'Not pursued' + clear hold state ───
    UPDATE dbo.Requests
    SET FieldValues =
            JSON_MODIFY(
              JSON_MODIFY(
                JSON_MODIFY(
                  JSON_MODIFY(
                    JSON_MODIFY(FieldValues, N'$.outcome', N'NotPursued'),
                    N'$.outcomeKind', N'local'),
                  N'$.outcomeNotes', COALESCE(NULLIF(StatusHoldNote, N''), N'Migrated from the retired Abandoned status.')),
                N'$.holdBlocked', NULL),
              N'$.holdReason', NULL),
        StatusHold     = N'InProgress',
        StatusHoldNote = NULL,
        UpdatedBy      = @Seed,
        UpdatedAt      = @Now
    WHERE StatusHold = N'Abandoned';

    -- ── 2) Tighten CK_Requests_StatusHold to drop 'Abandoned' ────────────────────
    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_Requests_StatusHold' AND parent_object_id = OBJECT_ID(N'dbo.Requests'))
        ALTER TABLE dbo.Requests DROP CONSTRAINT CK_Requests_StatusHold;

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_Requests_StatusHold' AND parent_object_id = OBJECT_ID(N'dbo.Requests'))
        ALTER TABLE dbo.Requests
            ADD CONSTRAINT CK_Requests_StatusHold
                CHECK (StatusHold IN (N'InProgress', N'OnHold'));

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_073_RetireAbandonedStatusHold')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260721_073_RetireAbandonedStatusHold', SUSER_SNAME(), N'Retire Abandoned status-hold: close existing Abandoned records as NotPursued; narrow CK_Requests_StatusHold to (InProgress, OnHold).');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
