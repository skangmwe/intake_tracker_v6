-- =============================================
-- Author:      close/status cleanup — rollback of 073 (restore 'Abandoned' to the CHECK)
-- Create Date: 2026-07-21
-- Description: Reverses the SCHEMA half of 20260721_073 — widens CK_Requests_StatusHold back to
--              (InProgress, OnHold, Abandoned) so 'Abandoned' can be written again.
--              NOTE: the DATA half is forward-only. Records that were 'Abandoned' were closed with
--              outcome 'NotPursued' and set to 'InProgress'; this script cannot re-identify them
--              (the original state is not retained), so it restores the constraint only. If a true
--              data reversal is required, restore from backup.
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_Requests_StatusHold' AND parent_object_id = OBJECT_ID(N'dbo.Requests'))
        ALTER TABLE dbo.Requests DROP CONSTRAINT CK_Requests_StatusHold;

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_Requests_StatusHold' AND parent_object_id = OBJECT_ID(N'dbo.Requests'))
        ALTER TABLE dbo.Requests
            ADD CONSTRAINT CK_Requests_StatusHold
                CHECK (StatusHold IN (N'InProgress', N'OnHold', N'Abandoned'));

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_073_RetireAbandonedStatusHold';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
