-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: DATA migration. Seeds the task-level typed-field LIBRARY on the AI
--              Solutions workspace (blueprint S30) — the catalog of structured fields a
--              Task can capture (URL / Text / Number / Date / Select / Checkbox). These
--              are Task-object FieldDefinitions; analysts pick from the library on the
--              Tasks & gates composer (slice 7), admins extend it (S30). Seed examples
--              per the blueprint: Repo URL, Design doc URL, Accuracy %, Go-live date,
--              Environment, Privacy signed off. Seeded on the AI Solutions workspace (the
--              build hub); other workspaces build their own library via S30. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws   UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions
DECLARE @Obj  NVARCHAR(16)     = N'Task';
DECLARE @Seed NVARCHAR(256)    = N'system-seed';

-- (FieldKey, DisplayName, FieldType, SortOrder)  — all WorkspaceLocal task-library fields.
DECLARE @Fields TABLE (FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), SortOrder INT);
INSERT INTO @Fields (FieldKey, DisplayName, FieldType, SortOrder)
VALUES
    (N'repoUrl',           N'Repo URL',          N'Url',          1),
    (N'designDocUrl',      N'Design doc URL',    N'Url',          2),
    (N'accuracyPct',       N'Accuracy %',        N'Number',       3),
    (N'goLiveDate',        N'Go-live date',      N'Date',         4),
    (N'environment',       N'Environment',       N'SingleSelect', 5),
    (N'privacySignedOff',  N'Privacy signed off', N'Boolean',     6);

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.FieldDefinition
        (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Section, SortOrder, CreatedBy, UpdatedBy)
    SELECT @Ws, @Obj, f.FieldKey, f.DisplayName, f.FieldType, N'WorkspaceLocal', N'Task field library', f.SortOrder, @Seed, @Seed
    FROM @Fields f
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldDefinition d
        WHERE d.WorkspaceId = @Ws AND d.ObjectType = @Obj AND d.FieldKey = f.FieldKey AND d.IsDeleted = 0);

    -- Environment select options — a starter set the admin can retune (S30).
    DECLARE @EnvFieldId UNIQUEIDENTIFIER = (
        SELECT FieldDefinitionId FROM dbo.FieldDefinition
        WHERE WorkspaceId = @Ws AND ObjectType = @Obj AND FieldKey = N'environment' AND IsDeleted = 0);

    IF @EnvFieldId IS NOT NULL
    BEGIN
        DECLARE @EnvOptions TABLE (OptionValue NVARCHAR(200), OptionLabel NVARCHAR(200), SortOrder INT);
        INSERT INTO @EnvOptions (OptionValue, OptionLabel, SortOrder)
        VALUES (N'Dev', N'Dev', 1), (N'Staging', N'Staging', 2), (N'Production', N'Production', 3);

        INSERT INTO dbo.SelectOption (FieldDefinitionId, OptionValue, OptionLabel, SortOrder, CreatedBy, UpdatedBy)
        SELECT @EnvFieldId, o.OptionValue, o.OptionLabel, o.SortOrder, @Seed, @Seed
        FROM @EnvOptions o
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.SelectOption s
            WHERE s.FieldDefinitionId = @EnvFieldId AND s.OptionValue = o.OptionValue AND s.IsDeleted = 0);
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_021_SeedTaskFieldLibrary')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260703_021_SeedTaskFieldLibrary', SUSER_SNAME(), N'Slice 3 — seed task-field library on AI Solutions workspace.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
