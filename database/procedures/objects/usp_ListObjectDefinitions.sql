-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab)
-- Create Date: 2026-07-20
-- Description: Lists the workspace's CUSTOM object definitions (S30 Objects tab). The five
--              built-in objects are composed as constants in ObjectSchemaService (with live
--              Records/Fields counts) — they are not stored here, so this returns only
--              admin-created custom rows. Read is Viewer+ (gated at the controller).
--              Return columns follow shared/types/objects.ts ObjectDefinitionDto (custom
--              rows carry no derived counts — the service sets them to 0).
--              Updated 2026-07-26 (SP3b Slice 1) — unions the workspace's own custom objects
--              with every Global custom object, deduped local-wins on ObjectKey (mirrors
--              usp_GetWorkspaceFields) so a workspace-local object shadows a same-slug Global one.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListObjectDefinitions
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    WITH candidates AS (
        SELECT o.ObjectDefinitionId, o.WorkspaceId, o.ObjectKey, o.Name, o.PluralLabel,
               o.Location, o.Description, o.ShowInSidebar, o.SidebarCategory,
               OwnRank = ROW_NUMBER() OVER (
                   PARTITION BY o.ObjectKey
                   ORDER BY CASE WHEN o.WorkspaceId = @Ws THEN 0 ELSE 1 END)
        FROM dbo.ObjectDefinition o
        WHERE o.IsDeleted = 0
          AND (o.WorkspaceId = @Ws OR o.Location = N'Global')
    )
    SELECT ObjectDefinitionId, WorkspaceId, ObjectKey, Name, PluralLabel,
           Location, Description, ShowInSidebar, SidebarCategory
    FROM candidates
    WHERE OwnRank = 1
    ORDER BY Name;
END;
GO
