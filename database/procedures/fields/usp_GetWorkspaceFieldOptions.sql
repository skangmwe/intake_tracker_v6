-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Returns every SelectOption for the Single-/Multi-select fields of one
--              (WorkspaceId, ObjectType), keyed by FieldKey so the API can group them
--              onto their fields in one pass. Soft-deleted rows excluded. Read-only
--              projection (database-stored-procedures.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFieldOptions
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(16)     = @ObjectType;

    SELECT
        d.FieldKey        AS FieldKey,
        s.SelectOptionId  AS SelectOptionId,
        s.OptionValue     AS OptionValue,
        s.OptionLabel     AS OptionLabel,
        s.SortOrder       AS SortOrder
    FROM dbo.SelectOption AS s
    INNER JOIN dbo.FieldDefinition AS d
        ON d.FieldDefinitionId = s.FieldDefinitionId
       AND d.IsDeleted = 0
    WHERE d.WorkspaceId = @WorkspaceIdLocal
      AND d.ObjectType = @ObjectTypeLocal
      AND s.IsDeleted = 0
    ORDER BY d.FieldKey, s.SortOrder;
END;
GO
