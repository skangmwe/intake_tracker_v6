-- =============================================
-- Author:      lifecycle rename — rollback for 20260720_069
-- Create Date: 2026-07-20
-- Description: Reverts records + tasks onto the old stage vocabulary. New tail stages with no
--              old equivalent collapse back: stabilization AND closure -> post-launch (records)
--              / Stabilization AND Closure -> Post-launch (tasks), so the restored CK_Tasks_Phase
--              stays satisfied. Run this BEFORE the 067 rollback. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.Requests
    SET Stage = CASE Stage
                    WHEN N'triage'        THEN N'discovery'
                    WHEN N'execution'     THEN N'build'
                    WHEN N'validation'    THEN N'qa'
                    WHEN N'delivery'      THEN N'deploy'
                    WHEN N'stabilization' THEN N'post-launch'
                    WHEN N'closure'       THEN N'post-launch'
                    ELSE Stage
                END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE Stage IN (N'triage', N'execution', N'validation', N'delivery', N'stabilization', N'closure');

    UPDATE dbo.Requests
    SET FieldValues = JSON_MODIFY(FieldValues, N'$.stage',
                          CASE JSON_VALUE(FieldValues, N'$.stage')
                              WHEN N'triage'        THEN N'discovery'
                              WHEN N'execution'     THEN N'build'
                              WHEN N'validation'    THEN N'qa'
                              WHEN N'delivery'      THEN N'deploy'
                              WHEN N'stabilization' THEN N'post-launch'
                              WHEN N'closure'       THEN N'post-launch'
                          END),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE JSON_VALUE(FieldValues, N'$.stage') IN (N'triage', N'execution', N'validation', N'delivery', N'stabilization', N'closure');

    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_Tasks_Phase' AND parent_object_id = OBJECT_ID(N'dbo.Tasks'))
        ALTER TABLE dbo.Tasks DROP CONSTRAINT CK_Tasks_Phase;

    UPDATE dbo.Tasks
    SET Phase = CASE Phase
                    WHEN N'Triage'        THEN N'Discovery'
                    WHEN N'Execution'     THEN N'Build'
                    WHEN N'Validation'    THEN N'QA'
                    WHEN N'Delivery'      THEN N'Deploy'
                    WHEN N'Stabilization' THEN N'Post-launch'
                    WHEN N'Closure'       THEN N'Post-launch'
                    ELSE Phase
                END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE Phase IN (N'Triage', N'Execution', N'Validation', N'Delivery', N'Stabilization', N'Closure');

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_Tasks_Phase' AND parent_object_id = OBJECT_ID(N'dbo.Tasks'))
        ALTER TABLE dbo.Tasks
            ADD CONSTRAINT CK_Tasks_Phase CHECK (Phase IN
                (N'Intake', N'Discovery', N'Build', N'QA', N'Deploy', N'Post-launch', N'Unphased'));

    UPDATE dbo.TaskBundleTemplate
    SET TasksJson =
            REPLACE(REPLACE(REPLACE(REPLACE(TasksJson,
                N'"phase":"Triage"',     N'"phase":"Discovery"'),
                N'"phase":"Execution"',  N'"phase":"Build"'),
                N'"phase":"Validation"', N'"phase":"QA"'),
                N'"phase":"Delivery"',   N'"phase":"Deploy"'),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE TasksJson LIKE N'%"phase":"Triage"%'
       OR TasksJson LIKE N'%"phase":"Execution"%'
       OR TasksJson LIKE N'%"phase":"Validation"%'
       OR TasksJson LIKE N'%"phase":"Delivery"%';

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_069_RenameStageKeysInRecordsAndTasks';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
