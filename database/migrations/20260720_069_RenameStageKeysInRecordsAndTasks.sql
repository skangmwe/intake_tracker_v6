-- =============================================
-- Author:      lifecycle rename — records & tasks
-- Create Date: 2026-07-20
-- Description: DATA + constraint migration. Moves live record and task rows onto the new stage
--              vocabulary (20260720_067):
--                * dbo.Requests.Stage (promoted column) and FieldValues.$.stage (mirror-on-write
--                  copy) — discovery->triage, build->execution, qa->validation, deploy->delivery,
--                  post-launch->stabilization. Existing post-launch records land on stabilization
--                  (the earlier of the two split stages).
--                * dbo.Tasks.Phase — same map (Post-launch -> Stabilization); CK_Tasks_Phase is
--                  swapped to the new 8-value set (adds Triage/Execution/Validation/Delivery/
--                  Stabilization/Closure, drops Discovery/Build/QA/Deploy/Post-launch).
--                * dbo.TaskBundleTemplate.TasksJson — the seeded bundle phases, so future
--                  applied bundles create tasks with valid new phases.
--              Constraint-drop + data-rename + constraint-add is one cohesive rename (see 067).
--              Idempotent — old values are absent after the first run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    -- ── 1) Requests.Stage promoted column ───────────────────────────────────────
    UPDATE dbo.Requests
    SET Stage = CASE Stage
                    WHEN N'discovery'   THEN N'triage'
                    WHEN N'build'       THEN N'execution'
                    WHEN N'qa'          THEN N'validation'
                    WHEN N'deploy'      THEN N'delivery'
                    WHEN N'post-launch' THEN N'stabilization'
                    ELSE Stage
                END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE Stage IN (N'discovery', N'build', N'qa', N'deploy', N'post-launch');

    -- ── 2) Requests.FieldValues.$.stage mirror copy ─────────────────────────────
    UPDATE dbo.Requests
    SET FieldValues = JSON_MODIFY(FieldValues, N'$.stage',
                          CASE JSON_VALUE(FieldValues, N'$.stage')
                              WHEN N'discovery'   THEN N'triage'
                              WHEN N'build'       THEN N'execution'
                              WHEN N'qa'          THEN N'validation'
                              WHEN N'deploy'      THEN N'delivery'
                              WHEN N'post-launch' THEN N'stabilization'
                          END),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE JSON_VALUE(FieldValues, N'$.stage') IN (N'discovery', N'build', N'qa', N'deploy', N'post-launch');

    -- ── 3) Tasks.Phase — drop CHECK, remap, re-add CHECK with the new 8 values ───
    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_Tasks_Phase' AND parent_object_id = OBJECT_ID(N'dbo.Tasks'))
        ALTER TABLE dbo.Tasks DROP CONSTRAINT CK_Tasks_Phase;

    UPDATE dbo.Tasks
    SET Phase = CASE Phase
                    WHEN N'Discovery'   THEN N'Triage'
                    WHEN N'Build'       THEN N'Execution'
                    WHEN N'QA'          THEN N'Validation'
                    WHEN N'Deploy'      THEN N'Delivery'
                    WHEN N'Post-launch' THEN N'Stabilization'
                    ELSE Phase
                END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE Phase IN (N'Discovery', N'Build', N'QA', N'Deploy', N'Post-launch');

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_Tasks_Phase' AND parent_object_id = OBJECT_ID(N'dbo.Tasks'))
        ALTER TABLE dbo.Tasks
            ADD CONSTRAINT CK_Tasks_Phase CHECK (Phase IN
                (N'Intake', N'Triage', N'Execution', N'Validation', N'Delivery', N'Stabilization', N'Closure', N'Unphased'));

    -- ── 4) TaskBundleTemplate.TasksJson seeded phases ───────────────────────────
    UPDATE dbo.TaskBundleTemplate
    SET TasksJson =
            REPLACE(REPLACE(REPLACE(REPLACE(TasksJson,
                N'"phase":"Discovery"', N'"phase":"Triage"'),
                N'"phase":"Build"',     N'"phase":"Execution"'),
                N'"phase":"QA"',        N'"phase":"Validation"'),
                N'"phase":"Deploy"',    N'"phase":"Delivery"'),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE TasksJson LIKE N'%"phase":"Discovery"%'
       OR TasksJson LIKE N'%"phase":"Build"%'
       OR TasksJson LIKE N'%"phase":"QA"%'
       OR TasksJson LIKE N'%"phase":"Deploy"%';

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_069_RenameStageKeysInRecordsAndTasks')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260720_069_RenameStageKeysInRecordsAndTasks', SUSER_SNAME(), N'Rename stage keys on records + task phases; split post-launch -> stabilization.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
