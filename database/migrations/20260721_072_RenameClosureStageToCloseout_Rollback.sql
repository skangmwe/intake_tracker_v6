-- =============================================
-- Author:      close/status cleanup — rollback of 072 (Closeout -> Closure)
-- Create Date: 2026-07-21
-- Description: Reverses 20260721_072. Renames the stage back Closeout -> Closure globally by key,
--              restores Requests.Stage / $.stage, Tasks.Phase + CK_Tasks_Phase, TaskBundleTemplate,
--              and the StageDefinition key/label/bucket + CK_StageDefinition_StatusCategory.
--              Idempotent — the 'closeout' key/label/bucket are absent after the first run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.Requests
    SET Stage = N'closure', UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE Stage = N'closeout';

    UPDATE dbo.Requests
    SET FieldValues = JSON_MODIFY(FieldValues, N'$.stage', N'closure'),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE JSON_VALUE(FieldValues, N'$.stage') = N'closeout';

    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_Tasks_Phase' AND parent_object_id = OBJECT_ID(N'dbo.Tasks'))
        ALTER TABLE dbo.Tasks DROP CONSTRAINT CK_Tasks_Phase;

    UPDATE dbo.Tasks
    SET Phase = N'Closure', UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE Phase = N'Closeout';

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_Tasks_Phase' AND parent_object_id = OBJECT_ID(N'dbo.Tasks'))
        ALTER TABLE dbo.Tasks
            ADD CONSTRAINT CK_Tasks_Phase CHECK (Phase IN
                (N'Intake', N'Triage', N'Execution', N'Validation', N'Delivery', N'Stabilization', N'Closure', N'Unphased'));

    UPDATE dbo.TaskBundleTemplate
    SET TasksJson = REPLACE(TasksJson, N'"phase":"Closeout"', N'"phase":"Closure"'),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE TasksJson LIKE N'%"phase":"Closeout"%';

    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_StageDefinition_StatusCategory'
                 AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition DROP CONSTRAINT CK_StageDefinition_StatusCategory;

    UPDATE dbo.StageDefinition
    SET StageKey = N'closure', Label = N'Closure', StatusCategory = N'Closure',
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE StageKey = N'closeout';

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_StageDefinition_StatusCategory'
                     AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition
            ADD CONSTRAINT CK_StageDefinition_StatusCategory
                CHECK (StatusCategory IN
                    (N'Intake', N'Triage', N'Execution', N'Validation', N'Delivery', N'Stabilization', N'Closure'));

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_072_RenameClosureStageToCloseout';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
