-- =============================================
-- Author:      /dev-build-application (Slice — Fields tab reconciliation)
-- Create Date: 2026-07-21
-- Description: Adds dbo.FieldDefinition.Location — the field-scope attribute surfaced as the
--              LOCATION column on the reconciled S30 Fields tab (flat catalog). Mirrors the
--              exact domain already modelled on dbo.ObjectDefinition (migration 071):
--                'Global'         — the field is available to every workspace (AI Solutions
--                                   hub plus any PG/Dept workspace).
--                'LocalWorkspace' — the field is scoped to the owning workspace only.
--              Default 'LocalWorkspace' — existing custom fields stay workspace-scoped.
--
--              A global field is owned by the workspace that created it but is read (and
--              rendered) by every workspace, so its key must be unique across the whole
--              object type. The filtered unique index below enforces that; the existing
--              per-workspace unique index (UX_FieldDefinition_Workspace_Object_Key) still
--              governs local keys.
--
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- 1. Add the Location column (nullable-free with a safe default so existing rows backfill).
IF COL_LENGTH(N'dbo.FieldDefinition', N'Location') IS NULL
    ALTER TABLE dbo.FieldDefinition
        ADD Location NVARCHAR(20) NOT NULL
            CONSTRAINT DF_FieldDefinition_Location DEFAULT N'LocalWorkspace';
GO

-- 2. Domain check — Global | LocalWorkspace (matches dbo.ObjectDefinition).
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_FieldDefinition_Location'
      AND parent_object_id = OBJECT_ID(N'dbo.FieldDefinition')
)
BEGIN
    ALTER TABLE dbo.FieldDefinition
        ADD CONSTRAINT CK_FieldDefinition_Location
        CHECK (Location IN (N'Global', N'LocalWorkspace'));
END;
GO

-- 3. A Global field key is unique across every workspace for its object type.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Global_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_FieldDefinition_Global_Object_Key
        ON dbo.FieldDefinition (ObjectType, FieldKey)
        WHERE Location = N'Global' AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_072_AlterFieldDefinition_AddLocation')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260721_072_AlterFieldDefinition_AddLocation', SUSER_SNAME(),
            N'Fields tab reconciliation — FieldDefinition.Location (Global | LocalWorkspace) + global-key unique index.');
END;
GO
