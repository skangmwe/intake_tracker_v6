-- =============================================
-- Author:      Slice 4a — Task Due Date
-- Create Date: 2026-07-24
-- Description: DATA migration. Surfaces the Task's new Due Date attribute as a first-class, read-only
--              Global field definition so it appears on the Platform Fields & objects tab under Task
--              (like the other Task attribute fields seeded in migration 075) and backs the Task CSV
--              export field picker. The VALUE lives on dbo.Tasks.DueDate (migration 088); this row is
--              catalog metadata only, read-only.
--
--              Seeded on the AI Solutions hub workspace (1A150000-…-001) with Location = 'Global' so
--              the cross-workspace platform catalog renders it once for the Task object. Global keys
--              are unique per (ObjectType, FieldKey) via UX_FieldDefinition_Global_Object_Key, which
--              backs the NOT EXISTS idempotency guard. SortOrder 7 follows the six Task fields from
--              075 (max SortOrder was 6). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws   UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions hub
DECLARE @Obj  NVARCHAR(16)     = N'Task';
DECLARE @Seed NVARCHAR(256)    = N'system-seed';

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.FieldDefinition
        (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, Section,
         IsReadOnly, SortOrder, CreatedBy, UpdatedBy)
    SELECT @Ws, @Obj, N'dueDate', N'Due Date', N'Date', N'Platform', N'Global', N'Task attributes',
           1, 7, @Seed, @Seed
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldDefinition d
        WHERE d.ObjectType = @Obj
          AND d.FieldKey   = N'dueDate'
          AND d.Location    = N'Global'
          AND d.IsDeleted   = 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_089_SeedTaskDueDateField')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260724_089_SeedTaskDueDateField', SUSER_SNAME(),
                N'Surface Task Due Date as a read-only Global field definition.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
