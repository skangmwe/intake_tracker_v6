-- =============================================
-- Author:      close/status cleanup — rename Closure stage -> Closeout
-- Create Date: 2026-07-21
-- Description: DATA + constraint migration. Renames the lifecycle stage "Closure" to "Closeout"
--              GLOBALLY by old key (symmetric with 067/069) so no lifecycle ends up with records
--              on a key its StageDefinition no longer defines. This frees the word "close" for the
--              record-Close (outcome) action, which is a different concept (a stage is a position;
--              closing sets an Outcome). Touches every layer that carried the key/label/bucket:
--                * dbo.StageDefinition   StageKey 'closure'->'closeout', Label 'Closure'->'Closeout',
--                                        StatusCategory 'Closure'->'Closeout' (the 1:1 bucket).
--                * dbo.Requests.Stage    'closure'->'closeout' (+ FieldValues.$.stage mirror).
--                * dbo.Tasks.Phase       'Closure'->'Closeout'; CK_Tasks_Phase swapped.
--                * dbo.TaskBundleTemplate.TasksJson seeded phases.
--                * CK_StageDefinition_StatusCategory swapped ('Closure'->'Closeout').
--              GateDefinition references stages by StageDefinitionId (GUID), so gate wiring is
--              untouched. Constraint-drop + data-rename + constraint-add is one cohesive change
--              (a rename cannot be split without leaving a CHECK unsatisfiable mid-flight — see 067).
--              Idempotent — the old key/label/bucket are absent after the first run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    -- ── 1) Requests.Stage promoted column ───────────────────────────────────────
    UPDATE dbo.Requests
    SET Stage = N'closeout', UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE Stage = N'closure';

    -- ── 2) Requests.FieldValues.$.stage mirror copy ─────────────────────────────
    UPDATE dbo.Requests
    SET FieldValues = JSON_MODIFY(FieldValues, N'$.stage', N'closeout'),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE JSON_VALUE(FieldValues, N'$.stage') = N'closure';

    -- ── 3) Tasks.Phase — drop CHECK, remap, re-add with Closeout ─────────────────
    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_Tasks_Phase' AND parent_object_id = OBJECT_ID(N'dbo.Tasks'))
        ALTER TABLE dbo.Tasks DROP CONSTRAINT CK_Tasks_Phase;

    UPDATE dbo.Tasks
    SET Phase = N'Closeout', UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE Phase = N'Closure';

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_Tasks_Phase' AND parent_object_id = OBJECT_ID(N'dbo.Tasks'))
        ALTER TABLE dbo.Tasks
            ADD CONSTRAINT CK_Tasks_Phase CHECK (Phase IN
                (N'Intake', N'Triage', N'Execution', N'Validation', N'Delivery', N'Stabilization', N'Closeout', N'Unphased'));

    -- ── 4) TaskBundleTemplate.TasksJson seeded phases ───────────────────────────
    UPDATE dbo.TaskBundleTemplate
    SET TasksJson = REPLACE(TasksJson, N'"phase":"Closure"', N'"phase":"Closeout"'),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE TasksJson LIKE N'%"phase":"Closure"%';

    -- ── 5) StageDefinition — drop category CHECK, rename key/label/bucket, re-add ─
    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_StageDefinition_StatusCategory'
                 AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition DROP CONSTRAINT CK_StageDefinition_StatusCategory;

    UPDATE dbo.StageDefinition
    SET StageKey = N'closeout', Label = N'Closeout', StatusCategory = N'Closeout',
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE StageKey = N'closure';

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_StageDefinition_StatusCategory'
                     AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition
            ADD CONSTRAINT CK_StageDefinition_StatusCategory
                CHECK (StatusCategory IN
                    (N'Intake', N'Triage', N'Execution', N'Validation', N'Delivery', N'Stabilization', N'Closeout'));

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_072_RenameClosureStageToCloseout')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260721_072_RenameClosureStageToCloseout', SUSER_SNAME(), N'Rename lifecycle stage Closure -> Closeout (global by key: stage def, records, task phases, buckets).');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
