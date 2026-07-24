-- =============================================
-- Author:      surface-fields slice 3b (Feature dynamic export)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_076_SeedAiSolutionsFeatureSchema. Hard-deletes the 14 seeded
--              Feature field definitions on the AI Solutions hub (they are seed data, not user
--              content) and removes the migration-history row. Idempotent — safe to re-run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws  UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions hub
DECLARE @Obj NVARCHAR(16)     = N'Feature';

BEGIN TRY
    BEGIN TRANSACTION;

    DELETE FROM dbo.FieldDefinition
    WHERE ObjectType  = @Obj
      AND WorkspaceId = @Ws
      AND Location    = N'LocalWorkspace'
      AND CreatedBy   = N'system-seed'
      AND FieldKey IN (
          N'name', N'oneLiner', N'featureType', N'whatItDoes', N'howToReuse', N'capabilityTags',
          N'solutionPattern', N'techStack', N'maturity', N'owner', N'demoUrl', N'repoUrl',
          N'dataClassification', N'complianceFlags');

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_076_SeedAiSolutionsFeatureSchema';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
