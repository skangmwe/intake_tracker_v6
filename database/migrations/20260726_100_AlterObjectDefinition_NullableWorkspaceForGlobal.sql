-- =============================================
-- Author:      global-custom-objects (SP3b slice 1)
-- Create Date: 2026-07-26
-- Description: Makes dbo.ObjectDefinition.WorkspaceId nullable so a Global (platform-owned) custom
--              object has no owning workspace (WorkspaceId=NULL, Location='Global', IsSystem=0). Re-scopes
--              the per-workspace unique indexes to WHERE WorkspaceId IS NOT NULL, and adds firm-wide
--              Global unique indexes on ObjectKey/Name (mirrors UX_FieldDefinition_Global_Object_Key).
--              Idempotent per database-migrations.md.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Workspace_Name ON dbo.ObjectDefinition;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    DROP INDEX UX_ObjectDefinition_Workspace_ObjectKey ON dbo.ObjectDefinition;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.ObjectDefinition')
           AND name = N'WorkspaceId' AND is_nullable = 0)
    ALTER TABLE dbo.ObjectDefinition ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NULL;
GO

-- Per-workspace uniqueness now excludes NULL-workspace Global rows.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Workspace_Name
        ON dbo.ObjectDefinition (WorkspaceId, Name)
        WHERE WorkspaceId IS NOT NULL AND IsDeleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Workspace_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Workspace_ObjectKey
        ON dbo.ObjectDefinition (WorkspaceId, ObjectKey)
        WHERE WorkspaceId IS NOT NULL AND IsDeleted = 0;
GO

-- Firm-wide uniqueness for Global objects (mirrors UX_FieldDefinition_Global_Object_Key).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Global_ObjectKey' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Global_ObjectKey
        ON dbo.ObjectDefinition (ObjectKey)
        WHERE Location = N'Global' AND IsDeleted = 0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ObjectDefinition_Global_Name' AND object_id = OBJECT_ID(N'dbo.ObjectDefinition'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ObjectDefinition_Global_Name
        ON dbo.ObjectDefinition (Name)
        WHERE Location = N'Global' AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_100_AlterObjectDefinition_NullableWorkspaceForGlobal')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260726_100_AlterObjectDefinition_NullableWorkspaceForGlobal', SUSER_SNAME(), N'SP3b slice 1 — nullable WorkspaceId + Global unique indexes on ObjectDefinition.');
GO
