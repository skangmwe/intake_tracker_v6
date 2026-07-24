-- =============================================
-- Author:      task-export-fields (Task attributes — surface + export)
-- Create Date: 2026-07-23
-- Description: DATA migration. Surfaces the Task object's core attributes as first-class,
--              read-only Global field definitions so they appear on the Platform Fields &
--              objects tab under Task (like Request's own fields — NOT the locked System
--              auto-fields) and back the Task CSV export field picker. The VALUES already
--              live as columns on dbo.Tasks (RecordId / AssigneeUserId / Status / Phase /
--              CompletedAt / Notes); these rows are catalog metadata only, read-only.
--
--              Seeded on the AI Solutions hub workspace (1A150000-…-001, the build hub) with
--              Location = 'Global', so the cross-workspace platform catalog renders them once
--              for the Task object regardless of which workspace owns the row. Global keys are
--              unique per (ObjectType, FieldKey) via UX_FieldDefinition_Global_Object_Key,
--              which backs the NOT EXISTS idempotency guard. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws   UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions hub
DECLARE @Obj  NVARCHAR(16)     = N'Task';
DECLARE @Seed NVARCHAR(256)    = N'system-seed';

-- (FieldKey, DisplayName, FieldType, SortOrder) — read-only Global Task attribute fields.
DECLARE @Fields TABLE (FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), SortOrder INT);
INSERT INTO @Fields (FieldKey, DisplayName, FieldType, SortOrder)
VALUES
    (N'parentRequest', N'Request',        N'RecordReference', 1),
    (N'assignee',      N'Assignee',       N'UserReference',   2),
    (N'status',        N'Status',         N'SingleSelect',    3),
    (N'phase',         N'Phase',          N'SingleSelect',    4),
    (N'completedAt',   N'Completed date', N'DateTime',        5),
    (N'notes',         N'Notes',          N'LongText',        6);

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.FieldDefinition
        (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, Section,
         IsReadOnly, SortOrder, CreatedBy, UpdatedBy)
    SELECT @Ws, @Obj, f.FieldKey, f.DisplayName, f.FieldType, N'Platform', N'Global', N'Task attributes',
           1, f.SortOrder, @Seed, @Seed
    FROM @Fields f
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldDefinition d
        WHERE d.ObjectType = @Obj
          AND d.FieldKey   = f.FieldKey
          AND d.Location    = N'Global'
          AND d.IsDeleted   = 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260723_075_SeedTaskPlatformFields')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260723_075_SeedTaskPlatformFields', SUSER_SNAME(),
                N'Surface Task attributes (Request/Assignee/Status/Phase/Completed date/Notes) as read-only Global field definitions.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
