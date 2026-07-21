-- =============================================
-- Author:      lifecycle rename — field schema
-- Create Date: 2026-07-20
-- Description: DATA migration. Remaps the old stage keys wherever the §17 Request field schema
--              references them, to match 20260720_067:
--                * FieldDefinition.VisibleStagesJson — the per-stage visibility arrays. Each old
--                  key is token-replaced; "post-launch" expands to "stabilization","closure" so
--                  the post-launch value fields stay visible across both new tail stages.
--                * FieldDefinition.Section — the display grouping headers rename
--                  (Build -> Execution; Deploy & outcome -> Delivery & outcome;
--                   Post-launch value -> Stabilization & closure value).
--                * FieldRule — the mirror/display "stage collapse" rules. CompareValue stage
--                  keys are remapped; the PG-facing produce value "Deployed" -> "Delivered";
--                  and a new closure -> Delivered mirror rule is added (delivery, stabilization,
--                  and closure all mirror as "Delivered", per the rename decision).
--              Applies to every workspace's Request field defs so AI-side and PG-side stay in
--              sync. Idempotent — the old tokens are absent after the first run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    -- ── 1) VisibleStagesJson token remap ────────────────────────────────────────
    UPDATE dbo.FieldDefinition
    SET VisibleStagesJson =
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(VisibleStagesJson,
                N'"post-launch"', N'"stabilization","closure"'),
                N'"discovery"',   N'"triage"'),
                N'"build"',       N'"execution"'),
                N'"qa"',          N'"validation"'),
                N'"deploy"',      N'"delivery"'),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE ObjectType = N'Request'
      AND VisibleStagesJson IS NOT NULL
      AND (VisibleStagesJson LIKE N'%"discovery"%'
        OR VisibleStagesJson LIKE N'%"build"%'
        OR VisibleStagesJson LIKE N'%"qa"%'
        OR VisibleStagesJson LIKE N'%"deploy"%'
        OR VisibleStagesJson LIKE N'%"post-launch"%');

    -- ── 2) Section header renames ───────────────────────────────────────────────
    UPDATE dbo.FieldDefinition SET Section = N'Execution',                    UpdatedBy = @Seed, UpdatedAt = @Now WHERE ObjectType = N'Request' AND Section = N'Build';
    UPDATE dbo.FieldDefinition SET Section = N'Delivery & outcome',           UpdatedBy = @Seed, UpdatedAt = @Now WHERE ObjectType = N'Request' AND Section = N'Deploy & outcome';
    UPDATE dbo.FieldDefinition SET Section = N'Stabilization & closure value', UpdatedBy = @Seed, UpdatedAt = @Now WHERE ObjectType = N'Request' AND Section = N'Post-launch value';

    -- ── 3) FieldRule stage-collapse remap (mirror/display "when stage eq …") ─────
    UPDATE dbo.FieldRule
    SET CompareValue = CASE CompareValue
                           WHEN N'discovery'   THEN N'triage'
                           WHEN N'build'       THEN N'execution'
                           WHEN N'qa'          THEN N'validation'
                           WHEN N'deploy'      THEN N'delivery'
                           WHEN N'post-launch' THEN N'stabilization'
                           ELSE CompareValue
                       END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE WhenFieldKey = N'stage'
      AND IsDeleted = 0
      AND CompareValue IN (N'discovery', N'build', N'qa', N'deploy', N'post-launch');

    -- PG-facing produce label: Deployed -> Delivered.
    UPDATE dbo.FieldRule
    SET ProduceValue = N'Delivered', UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE ProduceValue = N'Deployed' AND IsDeleted = 0;

    -- New closure mirror rule (closure also collapses to "Delivered") for every mirrorStatus
    -- field that already carries the stabilization collapse rule.
    INSERT INTO dbo.FieldRule (FieldDefinitionId, [Action], WhenFieldKey, Comparator, CompareValue, ProduceValue, SortOrder, CreatedBy, UpdatedBy)
    SELECT fd.FieldDefinitionId, N'ProduceValue', N'stage', N'eq', N'closure', N'Delivered', 5, @Seed, @Seed
    FROM dbo.FieldDefinition AS fd
    WHERE fd.FieldKey = N'mirrorStatus'
      AND fd.IsDeleted = 0
      AND EXISTS (SELECT 1 FROM dbo.FieldRule x
                  WHERE x.FieldDefinitionId = fd.FieldDefinitionId AND x.WhenFieldKey = N'stage'
                    AND x.CompareValue = N'stabilization' AND x.[Action] = N'ProduceValue' AND x.IsDeleted = 0)
      AND NOT EXISTS (SELECT 1 FROM dbo.FieldRule x
                  WHERE x.FieldDefinitionId = fd.FieldDefinitionId AND x.WhenFieldKey = N'stage'
                    AND x.CompareValue = N'closure' AND x.[Action] = N'ProduceValue' AND x.IsDeleted = 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_068_RenameStageKeysInRequestSchema')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260720_068_RenameStageKeysInRequestSchema', SUSER_SNAME(), N'Rename stage keys in Request field visibility, sections, and mirror rules.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
