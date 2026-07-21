-- =============================================
-- Author:      lifecycle rename — rollback for 20260720_068
-- Create Date: 2026-07-20
-- Description: Reverts the Request field-schema stage-key remap: restores VisibleStagesJson
--              tokens, section headers, and the mirror/display collapse rules (removes the
--              new closure rule, reverses CompareValue keys, Delivered -> Deployed). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';
DECLARE @Now  DATETIME2     = SYSUTCDATETIME();

BEGIN TRY
    BEGIN TRANSACTION;

    -- Remove the closure mirror rule first (added by 068).
    DELETE FROM dbo.FieldRule
    WHERE WhenFieldKey = N'stage' AND CompareValue = N'closure' AND [Action] = N'ProduceValue';

    -- Reverse the produce label and CompareValue keys.
    UPDATE dbo.FieldRule
    SET ProduceValue = N'Deployed', UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE ProduceValue = N'Delivered' AND IsDeleted = 0;

    UPDATE dbo.FieldRule
    SET CompareValue = CASE CompareValue
                           WHEN N'triage'        THEN N'discovery'
                           WHEN N'execution'     THEN N'build'
                           WHEN N'validation'    THEN N'qa'
                           WHEN N'delivery'      THEN N'deploy'
                           WHEN N'stabilization' THEN N'post-launch'
                           ELSE CompareValue
                       END,
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE WhenFieldKey = N'stage'
      AND IsDeleted = 0
      AND CompareValue IN (N'triage', N'execution', N'validation', N'delivery', N'stabilization');

    -- Reverse section headers.
    UPDATE dbo.FieldDefinition SET Section = N'Build',             UpdatedBy = @Seed, UpdatedAt = @Now WHERE ObjectType = N'Request' AND Section = N'Execution';
    UPDATE dbo.FieldDefinition SET Section = N'Deploy & outcome',  UpdatedBy = @Seed, UpdatedAt = @Now WHERE ObjectType = N'Request' AND Section = N'Delivery & outcome';
    UPDATE dbo.FieldDefinition SET Section = N'Post-launch value', UpdatedBy = @Seed, UpdatedAt = @Now WHERE ObjectType = N'Request' AND Section = N'Stabilization & closure value';

    -- Reverse VisibleStagesJson tokens.
    UPDATE dbo.FieldDefinition
    SET VisibleStagesJson =
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(VisibleStagesJson,
                N'"stabilization","closure"', N'"post-launch"'),
                N'"triage"',    N'"discovery"'),
                N'"execution"', N'"build"'),
                N'"validation"',N'"qa"'),
                N'"delivery"',  N'"deploy"'),
        UpdatedBy = @Seed, UpdatedAt = @Now
    WHERE ObjectType = N'Request'
      AND VisibleStagesJson IS NOT NULL
      AND (VisibleStagesJson LIKE N'%"triage"%'
        OR VisibleStagesJson LIKE N'%"execution"%'
        OR VisibleStagesJson LIKE N'%"validation"%'
        OR VisibleStagesJson LIKE N'%"delivery"%'
        OR VisibleStagesJson LIKE N'%"stabilization","closure"%');

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_068_RenameStageKeysInRequestSchema';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
