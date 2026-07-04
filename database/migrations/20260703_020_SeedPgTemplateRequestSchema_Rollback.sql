-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_020_SeedPgTemplateRequestSchema. Removes the
--              seeded Request field schema (and its children) from the PG/Dept template
--              workspace. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws  UNIQUEIDENTIFIER = N'9C700000-0000-4000-8000-000000000001';
DECLARE @Obj NVARCHAR(16)     = N'Request';

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @Ids TABLE (FieldDefinitionId UNIQUEIDENTIFIER PRIMARY KEY);
    INSERT INTO @Ids (FieldDefinitionId)
    SELECT FieldDefinitionId FROM dbo.FieldDefinition WHERE WorkspaceId = @Ws AND ObjectType = @Obj;

    DELETE FROM dbo.FieldRule           WHERE FieldDefinitionId IN (SELECT FieldDefinitionId FROM @Ids);
    DELETE FROM dbo.DerivedField        WHERE FieldDefinitionId IN (SELECT FieldDefinitionId FROM @Ids);
    DELETE FROM dbo.SelectOption        WHERE FieldDefinitionId IN (SELECT FieldDefinitionId FROM @Ids);
    DELETE FROM dbo.FieldRuleDependency WHERE WorkspaceId = @Ws AND ObjectType = @Obj;
    DELETE FROM dbo.FieldDefinition     WHERE WorkspaceId = @Ws AND ObjectType = @Obj;

    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_020_SeedPgTemplateRequestSchema';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
