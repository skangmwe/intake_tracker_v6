-- =============================================
-- Author:      surface-fields slice 3b (Feature dynamic export)
-- Create Date: 2026-07-24
-- Description: DATA migration. Seeds the Feature object's field schema as first-class field
--              definitions so Feature fields appear on the Fields & objects catalog (like the
--              Request schema seeded in migration 019) and back the Feature CSV export field
--              picker. The VALUES already live in dbo.Features.FieldValues (a complete JSON map
--              keyed by these field keys — name / oneLiner / featureType / capabilityTags[] / … );
--              these rows are catalog metadata only.
--
--              Seeded on the AI Solutions hub workspace (1A150000-…-001) where Features live, with
--              Location = 'LocalWorkspace' and Category = 'WorkspaceLocal' — the same shape as the
--              hub's Request fields (editable content fields, not the locked System auto-fields).
--              Feature is not a Platform-catalog object, so these are not Global/platform rows.
--              Uniqueness is per (WorkspaceId, ObjectType, FieldKey); the NOT EXISTS guard keys off
--              (ObjectType, FieldKey, Location). Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws   UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions hub
DECLARE @Obj  NVARCHAR(16)     = N'Feature';
DECLARE @Seed NVARCHAR(256)    = N'system-seed';

-- (FieldKey, DisplayName, FieldType, IsRequired, SortOrder) — the Feature content fields, matching the
-- keys stored in dbo.Features.FieldValues. Name and Type are required at create (usp_CreateFeature).
DECLARE @Fields TABLE (FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), IsRequired BIT, SortOrder INT);
INSERT INTO @Fields (FieldKey, DisplayName, FieldType, IsRequired, SortOrder)
VALUES
    (N'name',               N'Name',                N'ShortText',    1,  1),
    (N'oneLiner',           N'One-liner',           N'ShortText',    0,  2),
    (N'featureType',        N'Type',                N'SingleSelect', 1,  3),
    (N'whatItDoes',         N'What it does',        N'LongText',     0,  4),
    (N'howToReuse',         N'How to reuse',        N'LongText',     0,  5),
    (N'capabilityTags',     N'Capability Tags',     N'MultiSelect',  0,  6),
    (N'solutionPattern',    N'Solution Pattern',    N'MultiSelect',  0,  7),
    (N'techStack',          N'Tech Stack',          N'MultiSelect',  0,  8),
    (N'maturity',           N'Maturity',            N'SingleSelect', 0,  9),
    (N'owner',              N'Owner',               N'ShortText',    0, 10),
    (N'demoUrl',            N'Demo URL',            N'Url',          0, 11),
    (N'repoUrl',            N'Repo URL',            N'Url',          0, 12),
    (N'dataClassification', N'Data Classification', N'SingleSelect', 0, 13),
    (N'complianceFlags',    N'Compliance Flags',    N'MultiSelect',  0, 14);

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.FieldDefinition
        (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, Section,
         IsRequired, IsReadOnly, SortOrder, CreatedBy, UpdatedBy)
    SELECT @Ws, @Obj, f.FieldKey, f.DisplayName, f.FieldType, N'WorkspaceLocal', N'LocalWorkspace',
           N'Feature catalog', f.IsRequired, 0, f.SortOrder, @Seed, @Seed
    FROM @Fields f
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldDefinition d
        WHERE d.ObjectType = @Obj
          AND d.FieldKey   = f.FieldKey
          AND d.Location    = N'LocalWorkspace'
          AND d.WorkspaceId = @Ws
          AND d.IsDeleted   = 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260724_076_SeedAiSolutionsFeatureSchema')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260724_076_SeedAiSolutionsFeatureSchema', SUSER_SNAME(),
                N'Seed the Feature field schema (14 content fields) on the AI Solutions hub so Feature fields surface in the catalog + export.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
