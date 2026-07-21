-- =============================================
-- Author:      lifecycle rename — rollback for 20260720_067
-- Create Date: 2026-07-20
-- Description: Reverts the global stage/bucket/gate rename. Restores the canonical stage keys and
--              labels (every lifecycle) and their original buckets, removes the new closure stage,
--              restores gate names, and swaps CK_StageDefinition_StatusCategory back to
--              Intake/Build/Review/Deploy. Idempotent. NOTE: run the 069 and 068 rollbacks
--              (records/tasks + field schema) BEFORE this one if they were applied, so no
--              record/task still references a new key when the vocabulary reverts.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

DECLARE @SClosure UNIQUEIDENTIFIER = N'57A60000-0000-4000-8000-000000000007';
DECLARE @GQa      UNIQUEIDENTIFIER = N'6A7E0000-0000-4000-8000-000000000001';
DECLARE @GPost    UNIQUEIDENTIFIER = N'6A7E0000-0000-4000-8000-000000000002';

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_StageDefinition_StatusCategory'
                 AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition DROP CONSTRAINT CK_StageDefinition_StatusCategory;

    -- Remove the closure stage (hard-delete the seeded row — it did not exist before 067).
    DELETE FROM dbo.StageDefinition WHERE StageDefinitionId = @SClosure;

    -- Reverse the global key + label rename (every lifecycle).
    UPDATE dbo.StageDefinition SET StageKey = N'discovery',   Label = N'Discovery',   UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'triage';
    UPDATE dbo.StageDefinition SET StageKey = N'build',       Label = N'Build',       UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'execution';
    UPDATE dbo.StageDefinition SET StageKey = N'qa',          Label = N'QA',          UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'validation';
    UPDATE dbo.StageDefinition SET StageKey = N'deploy',      Label = N'Deploy',      UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'delivery';
    UPDATE dbo.StageDefinition SET StageKey = N'post-launch', Label = N'Post-launch', UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'stabilization';

    -- Generic fallback bucket reverse for any admin-created custom-key stages.
    UPDATE dbo.StageDefinition
    SET StatusCategory = CASE StatusCategory
                             WHEN N'Execution'  THEN N'Build'
                             WHEN N'Validation' THEN N'Review'
                             WHEN N'Delivery'   THEN N'Deploy'
                             ELSE StatusCategory
                         END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE StatusCategory IN (N'Execution', N'Validation', N'Delivery');

    -- Restore canonical buckets by (restored) old key.
    UPDATE dbo.StageDefinition SET StatusCategory = N'Intake', UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'intake';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Build',  UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey IN (N'discovery', N'build');
    UPDATE dbo.StageDefinition SET StatusCategory = N'Review', UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'qa';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Deploy', UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey IN (N'deploy', N'post-launch');

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_StageDefinition_StatusCategory'
                     AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition
            ADD CONSTRAINT CK_StageDefinition_StatusCategory
                CHECK (StatusCategory IN (N'Intake', N'Build', N'Review', N'Deploy'));

    UPDATE dbo.GateDefinition SET Name = N'QA readiness gate',          UpdatedBy = @Seed, UpdatedAt = @Now WHERE GateDefinitionId = @GQa;
    UPDATE dbo.GateDefinition SET Name = N'Post-launch readiness gate', UpdatedBy = @Seed, UpdatedAt = @Now WHERE GateDefinitionId = @GPost;

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_067_RenameLifecycleStages';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
