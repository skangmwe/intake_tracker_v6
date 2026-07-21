-- =============================================
-- Author:      lifecycle rename follow-up — one status-category bucket per stage
-- Create Date: 2026-07-20
-- Description: Expands the dashboard rollup buckets from 4 to 7 so each lifecycle stage maps to
--              its own same-named status category (1:1). The stage-editor's status-category
--              dropdown then offers all seven. New set:
--                Intake · Triage · Execution · Validation · Delivery · Stabilization · Closure
--              Only three seeded stages change bucket (the rest already self-named by 067):
--                triage        Intake   -> Triage
--                stabilization Delivery -> Stabilization
--                closure       Delivery -> Closure
--              Applied GLOBALLY by stage key (every lifecycle). The old 4 buckets are a subset of
--              the new 7, so any admin-created custom-key stage stays constraint-valid.
--              Constraint-drop + data-set + constraint-add is one cohesive change. Idempotent.
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

    -- Each canonical stage maps to its own bucket (1:1), every lifecycle.
    UPDATE dbo.StageDefinition SET StatusCategory = N'Intake',        UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'intake';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Triage',        UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'triage';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Execution',     UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'execution';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Validation',    UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'validation';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Delivery',      UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'delivery';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Stabilization', UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'stabilization';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Closure',       UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'closure';

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_StageDefinition_StatusCategory'
                     AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition
            ADD CONSTRAINT CK_StageDefinition_StatusCategory
                CHECK (StatusCategory IN
                    (N'Intake', N'Triage', N'Execution', N'Validation', N'Delivery', N'Stabilization', N'Closure'));

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_070_ExpandStatusCategoriesToSeven')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260720_070_ExpandStatusCategoriesToSeven', SUSER_SNAME(), N'One status-category bucket per stage (4 -> 7).');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
