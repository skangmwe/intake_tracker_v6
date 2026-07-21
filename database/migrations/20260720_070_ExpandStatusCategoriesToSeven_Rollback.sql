-- =============================================
-- Author:      lifecycle rename follow-up — rollback for 20260720_070
-- Create Date: 2026-07-20
-- Description: Collapses the 7 status-category buckets back to 4 (triage -> Intake;
--              stabilization/closure -> Delivery) and restores the 4-value CHECK. A generic
--              fallback maps any remaining Triage/Stabilization/Closure bucket on a custom-key
--              stage so the restored 4-value constraint stays satisfied. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_StageDefinition_StatusCategory'
                 AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition DROP CONSTRAINT CK_StageDefinition_StatusCategory;

    -- Canonical stages back to the 4-bucket mapping.
    UPDATE dbo.StageDefinition SET StatusCategory = N'Intake',   UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'triage';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Delivery', UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey IN (N'stabilization', N'closure');

    -- Generic fallback for any custom-key stage still on a 7-only bucket.
    UPDATE dbo.StageDefinition
    SET StatusCategory = CASE StatusCategory
                             WHEN N'Triage'        THEN N'Intake'
                             WHEN N'Stabilization' THEN N'Delivery'
                             WHEN N'Closure'       THEN N'Delivery'
                             ELSE StatusCategory
                         END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE StatusCategory IN (N'Triage', N'Stabilization', N'Closure');

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_StageDefinition_StatusCategory'
                     AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition
            ADD CONSTRAINT CK_StageDefinition_StatusCategory
                CHECK (StatusCategory IN (N'Intake', N'Execution', N'Validation', N'Delivery'));

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_070_ExpandStatusCategoriesToSeven';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
