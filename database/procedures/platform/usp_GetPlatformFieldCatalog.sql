-- =============================================
-- Author:      /dev-build-application (Slice B1 — Platform Fields catalog)
-- Create Date: 2026-07-22
-- Description: The Global field definitions that feed the Platform Fields & objects catalog (S34).
--              Returns every Global, non-platform-defined field definition across ALL workspaces in
--              the same lightweight shape as usp_GetWorkspaceFieldCatalog (so the API can compose one
--              flat catalog with the same FieldCatalogRow entity). These are the workspace-created
--              fields shared to every workspace; on the platform screen they are read-only, so
--              IsLocal is 0. Platform-defined fields (dbo.PlatformField) and the synthesised system
--              auto-fields are added by the API, not here. The Global unique index
--              (UX_FieldDefinition_Global_Object_Key) guarantees at most one Global row per
--              (object type, key), so no de-duplication is needed. Soft-deleted rows excluded. Not an
--              access-gate proc — the controller verifies the Platform-admin grant.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetPlatformFieldCatalog
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        d.FieldDefinitionId    AS FieldDefinitionId,
        d.WorkspaceId          AS WorkspaceId,
        d.ObjectType           AS ObjectType,
        d.FieldKey             AS FieldKey,
        d.DisplayName          AS DisplayName,
        d.FieldType            AS FieldType,
        d.Location             AS Location,
        d.IsRequired           AS IsRequired,
        d.IsReadOnly           AS IsReadOnly,
        d.IsPlatformDefined    AS IsPlatformDefined,
        d.IsSystemProvisioned  AS IsSystemProvisioned,
        d.IsRetired            AS IsRetired,
        CAST(0 AS BIT)         AS IsLocal   -- global fields are read-only on the platform screen
    FROM dbo.FieldDefinition AS d
    WHERE d.IsDeleted = 0
      AND d.Location = N'Global'
      AND d.IsPlatformDefined = 0
    ORDER BY d.ObjectType, d.SortOrder, d.DisplayName;
END;
GO
