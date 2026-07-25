-- =============================================
-- Author:      Slice 4a — Task Due Date
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_089_SeedTaskDueDateField. Hard-deletes the seeded read-only
--              Global Task Due Date field definition (seed data, not user content) and removes the
--              migration-history row. Idempotent — safe to re-run.
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
      AND FieldKey    = N'dueDate';

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_089_SeedTaskDueDateField';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
