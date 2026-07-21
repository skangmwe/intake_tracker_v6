-- =============================================
-- Author:      lifecycle rename (Intake/Discovery/Build/QA/Deploy/Post-launch -> new vocabulary)
-- Create Date: 2026-07-20
-- Description: DATA + constraint migration. Renames the canonical lifecycle stage vocabulary and
--              splits Post-launch into two stages:
--                discovery   -> triage        execution keys/labels renamed GLOBALLY by old key
--                build       -> execution     (across every lifecycle, symmetric with the global
--                qa          -> validation     Requests.Stage rename in 069 — so no lifecycle can
--                deploy      -> delivery        end up with records on a key its StageDefinition
--                post-launch -> stabilization   no longer defines).
--                (new)       -> closure       (default "Standard AI build" lifecycle only, SortOrder 6)
--              intake is unchanged.
--
--              Dashboard rollup buckets rename Intake/Build/Review/Deploy ->
--              Intake/Execution/Validation/Delivery, so CK_StageDefinition_StatusCategory is
--              swapped. Buckets are set by the (new) canonical key across every lifecycle
--              (intake+triage -> Intake, execution -> Execution, validation -> Validation,
--              delivery+stabilization -> Delivery); a generic fallback remap first
--              (Build->Execution, Review->Validation, Deploy->Delivery) keeps any admin-created
--              custom-key stage constraint-valid.
--
--              The two seeded gates on the default lifecycle are renamed (QA readiness ->
--              Validation readiness; Post-launch readiness -> Stabilization readiness); their
--              from/to stage GUIDs are stable so the wiring is untouched. No gate is added on
--              stabilization -> closure (free transition, per the rename decision).
--
--              Constraint-drop + data-rename + constraint-add is one cohesive logical change
--              (a vocabulary rename cannot be split without leaving the CHECK unsatisfiable
--              mid-flight). Idempotent — the old keys/buckets are absent after the first run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws   UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions
DECLARE @Lc   UNIQUEIDENTIFIER = N'11FE0000-0000-4000-8000-000000000001'; -- default "Standard AI build"
DECLARE @Seed NVARCHAR(256)    = N'system-seed';
DECLARE @Now  DATETIME2        = SYSUTCDATETIME();

DECLARE @SClosure UNIQUEIDENTIFIER = N'57A60000-0000-4000-8000-000000000007';
DECLARE @GQa      UNIQUEIDENTIFIER = N'6A7E0000-0000-4000-8000-000000000001';
DECLARE @GPost    UNIQUEIDENTIFIER = N'6A7E0000-0000-4000-8000-000000000002';

BEGIN TRY
    BEGIN TRANSACTION;

    -- ── 1) Drop the old status-category CHECK so data can move to the new buckets ──
    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = N'CK_StageDefinition_StatusCategory'
                 AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition DROP CONSTRAINT CK_StageDefinition_StatusCategory;

    -- ── 2) Generic bucket fallback remap (keeps any admin-created custom-key stages valid) ──
    UPDATE dbo.StageDefinition
    SET StatusCategory = CASE StatusCategory
                             WHEN N'Build'  THEN N'Execution'
                             WHEN N'Review' THEN N'Validation'
                             WHEN N'Deploy' THEN N'Delivery'
                             ELSE StatusCategory
                         END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE StatusCategory IN (N'Build', N'Review', N'Deploy');

    -- ── 3) Rename stage keys + labels GLOBALLY by old key (every lifecycle) ──────
    UPDATE dbo.StageDefinition SET StageKey = N'triage',        Label = N'Triage',        UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'discovery';
    UPDATE dbo.StageDefinition SET StageKey = N'execution',     Label = N'Execution',     UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'build';
    UPDATE dbo.StageDefinition SET StageKey = N'validation',    Label = N'Validation',    UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'qa';
    UPDATE dbo.StageDefinition SET StageKey = N'delivery',      Label = N'Delivery',      UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'deploy';
    UPDATE dbo.StageDefinition SET StageKey = N'stabilization', Label = N'Stabilization', UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'post-launch';

    -- ── 4) Set buckets by the (new) canonical key, every lifecycle ───────────────
    UPDATE dbo.StageDefinition SET StatusCategory = N'Intake',     UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey IN (N'intake', N'triage');
    UPDATE dbo.StageDefinition SET StatusCategory = N'Execution',  UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'execution';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Validation', UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey = N'validation';
    UPDATE dbo.StageDefinition SET StatusCategory = N'Delivery',   UpdatedBy = @Seed, UpdatedAt = @Now WHERE StageKey IN (N'delivery', N'stabilization', N'closure');

    -- ── 5) Insert the new 7th stage: closure — DEFAULT lifecycle only (split of post-launch) ──
    IF NOT EXISTS (SELECT 1 FROM dbo.StageDefinition WHERE StageDefinitionId = @SClosure)
        INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, CreatedBy, UpdatedBy)
        VALUES (@SClosure, @Lc, @Ws, N'closure', N'Closure', N'Delivery', 6, @Seed, @Seed);

    -- ── 6) Re-add the status-category CHECK with the new bucket set ──────────────
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE name = N'CK_StageDefinition_StatusCategory'
                     AND parent_object_id = OBJECT_ID(N'dbo.StageDefinition'))
        ALTER TABLE dbo.StageDefinition
            ADD CONSTRAINT CK_StageDefinition_StatusCategory
                CHECK (StatusCategory IN (N'Intake', N'Execution', N'Validation', N'Delivery'));

    -- ── 7) Rename the two seeded gates on the default lifecycle (wiring GUIDs unchanged) ──
    UPDATE dbo.GateDefinition SET Name = N'Validation readiness gate',    UpdatedBy = @Seed, UpdatedAt = @Now WHERE GateDefinitionId = @GQa;
    UPDATE dbo.GateDefinition SET Name = N'Stabilization readiness gate', UpdatedBy = @Seed, UpdatedAt = @Now WHERE GateDefinitionId = @GPost;

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_067_RenameLifecycleStages')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260720_067_RenameLifecycleStages', SUSER_SNAME(), N'Rename lifecycle stages + buckets (global by key); split post-launch into stabilization + closure on the default lifecycle.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
