-- =============================================
-- Author:      /dev-build-application (Slice — Objects tab)
-- Create Date: 2026-07-20
-- Description: Returns one CUSTOM object definition by id, scoped to the workspace (S30
--              Objects tab). Used by ObjectSchemaService to re-read a row after create/patch.
--              Built-in objects are constants and are not returned here. No result set means
--              "not found" (the caller returns 404 / null).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetObjectDefinitionById
    @ObjectDefinitionId UNIQUEIDENTIFIER,
    @WorkspaceId        UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Id UNIQUEIDENTIFIER = @ObjectDefinitionId;
    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT o.ObjectDefinitionId,
           o.WorkspaceId,
           o.Name,
           o.PluralLabel,
           o.Location,
           o.Description,
           o.ShowInSidebar,
           o.SidebarCategory
    FROM   dbo.ObjectDefinition o
    WHERE  o.ObjectDefinitionId = @Id
      AND  o.WorkspaceId        = @Ws
      AND  o.IsDeleted          = 0;
END;
GO
