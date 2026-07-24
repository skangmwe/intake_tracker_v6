-- =============================================
-- Author:      /dev-build-application (Slice 1a — Custom-object records: storage & schema)
-- Create Date: 2026-07-24
-- Description: Returns one row per CUSTOM object in a workspace with its live field count (S30
--              Objects tab). FieldsCount is the number of active, non-retired dbo.FieldDefinition
--              rows whose ObjectType equals the object's slug (ObjectKey). A LEFT JOIN keeps
--              objects with zero fields in the result (FieldsCount = 0).
--
--              Record counts are NOT included here in slice 1a — the dbo.CustomRecords table does
--              not exist yet (added in slice 1b, which adds a RecordsCount column to this proc).
--              ObjectSchemaService keeps RecordsCount at 0 until then.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetCustomObjectCounts
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT o.ObjectDefinitionId,
           FieldsCount = COUNT(f.FieldDefinitionId)
    FROM   dbo.ObjectDefinition o
    LEFT JOIN dbo.FieldDefinition f
        ON  f.WorkspaceId = o.WorkspaceId
        AND f.ObjectType  = o.ObjectKey
        AND f.IsDeleted   = 0
        AND f.IsRetired   = 0
    WHERE  o.WorkspaceId = @Ws
      AND  o.IsDeleted   = 0
    GROUP  BY o.ObjectDefinitionId;
END;
GO
