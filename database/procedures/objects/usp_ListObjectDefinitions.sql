-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab)
-- Create Date: 2026-07-20
-- Description: Lists the workspace's CUSTOM object definitions (S30 Objects tab). The five
--              built-in objects are composed as constants in ObjectSchemaService (with live
--              Records/Fields counts) — they are not stored here, so this returns only
--              admin-created custom rows. Read is Viewer+ (gated at the controller).
--              Return columns follow shared/types/objects.ts ObjectDefinitionDto (custom
--              rows carry no derived counts — the service sets them to 0).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListObjectDefinitions
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT o.ObjectDefinitionId,
           o.WorkspaceId,
           o.ObjectKey,
           o.Name,
           o.PluralLabel,
           o.Location,
           o.Description,
           o.ShowInSidebar,
           o.SidebarCategory
    FROM   dbo.ObjectDefinition o
    WHERE  o.WorkspaceId = @Ws
      AND  o.IsDeleted   = 0
    ORDER  BY o.Name;
END;
GO
