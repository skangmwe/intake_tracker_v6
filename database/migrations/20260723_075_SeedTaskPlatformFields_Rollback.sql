-- =============================================
-- Author:      task-export-fields (Task attributes — surface + export)
-- Create Date: 2026-07-23
-- Description: Rollback for 20260723_075_SeedTaskPlatformFields. Hard-deletes the six seeded
--              read-only Global Task attribute field definitions (they are seed data, not user
--              content) and removes the migration-history row. Idempotent — safe to re-run.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Obj NVARCHAR(16) = N'Task';

BEGIN TRY
    BEGIN TRANSACTION;

    DELETE FROM dbo.FieldDefinition
    WHERE ObjectType = @Obj
      AND Location    = N'Global'
      AND CreatedBy   = N'system-seed'
      AND FieldKey IN (N'parentRequest', N'assignee', N'status', N'phase', N'completedAt', N'notes');

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260723_075_SeedTaskPlatformFields';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
