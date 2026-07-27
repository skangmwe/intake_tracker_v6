-- =============================================
-- Author:      global-custom-objects (SP3b slice 2a)
-- Create Date: 2026-07-26
-- Description: Makes dbo.FieldDefinition.WorkspaceId nullable so a Global (platform-owned) field
--              has no owning workspace (WorkspaceId=NULL, Location='Global', IsPlatformDefined=1).
--              Re-scopes the per-workspace unique index UX_FieldDefinition_Workspace_Object_Key
--              to WHERE WorkspaceId IS NOT NULL, so NULL-workspace Global rows don't participate
--              in per-workspace uniqueness. Idempotent per database-migrations.md.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Drop the per-workspace unique index before the metadata-only NOT NULL->NULL widening, then recreate
-- it re-scoped so NULL-workspace (platform-owned Global) rows don't participate in per-workspace uniqueness.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    DROP INDEX UX_FieldDefinition_Workspace_Object_Key ON dbo.FieldDefinition;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.FieldDefinition')
           AND name = N'WorkspaceId' AND is_nullable = 0)
    ALTER TABLE dbo.FieldDefinition ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FieldDefinition_Workspace_Object_Key' AND object_id = OBJECT_ID(N'dbo.FieldDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_FieldDefinition_Workspace_Object_Key
        ON dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey)
        WHERE WorkspaceId IS NOT NULL AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260726_101_AlterFieldDefinition_NullableWorkspaceForGlobal', SUSER_SNAME(), N'SP3b slice 2a — nullable WorkspaceId so a Global object''s fields are platform-owned (WorkspaceId NULL, Location=Global).');
GO
