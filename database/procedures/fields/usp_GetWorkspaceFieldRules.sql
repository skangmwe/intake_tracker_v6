-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Returns every condition-engine FieldRule for one (WorkspaceId, ObjectType),
--              keyed by the TARGET field's FieldKey so the API can group rules onto their
--              fields. Ordered by the target field then rule SortOrder (Derived-category
--              first-match-wins order, §3.4). Soft-deleted rows excluded. Read-only.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFieldRules
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(16)     = @ObjectType;

    SELECT
        d.FieldKey       AS FieldKey,
        r.FieldRuleId    AS FieldRuleId,
        r.[Action]       AS [Action],
        r.WhenFieldKey   AS WhenFieldKey,
        r.Comparator     AS Comparator,
        r.CompareValue   AS CompareValue,
        r.ProduceValue   AS ProduceValue,
        r.SortOrder      AS SortOrder
    FROM dbo.FieldRule AS r
    INNER JOIN dbo.FieldDefinition AS d
        ON d.FieldDefinitionId = r.FieldDefinitionId
       AND d.IsDeleted = 0
    WHERE d.WorkspaceId = @WorkspaceIdLocal
      AND d.ObjectType = @ObjectTypeLocal
      AND r.IsDeleted = 0
    ORDER BY d.FieldKey, r.SortOrder;
END;
GO
