-- =============================================
-- Author:      /dev-build-application (SP3b Slice 1 — Global custom objects)
-- Create Date: 2026-07-26
-- Description: Lists every active Global custom object definition (WorkspaceId NULL AND
--              Location='Global') — no workspace scope, used by the platform Objects tab.
--              Keyed on WorkspaceId IS NULL (not Location alone) so a workspace-owned row
--              mislabelled Location='Global' is never surfaced here. Same column list as
--              usp_ListObjectDefinitions.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListGlobalObjectDefinitions
AS
BEGIN
    SET NOCOUNT ON;
    SELECT o.ObjectDefinitionId, o.WorkspaceId, o.ObjectKey, o.Name, o.PluralLabel,
           o.Location, o.Description, o.ShowInSidebar, o.SidebarCategory
    FROM   dbo.ObjectDefinition o
    WHERE  o.WorkspaceId IS NULL AND o.Location = N'Global' AND o.IsDeleted = 0
    ORDER  BY o.Name;
END;
GO
