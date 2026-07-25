-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Returns every condition-engine FieldRule for one (WorkspaceId, ObjectType),
--              keyed by the TARGET field's FieldKey so the API can group rules onto their
--              fields. Ordered by the target field then rule SortOrder (Derived-category
--              first-match-wins order, §3.4). Soft-deleted rows excluded. Read-only.
--
--              Cross-workspace scope (Fields tab reconciliation): rules are returned for the
--              workspace's own fields AND every Global field of the object type. The winning
--              field per key (local over foreign-global) is resolved first so a colliding key
--              never double-lists rules — mirrors the dedup in usp_GetWorkspaceFields.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFieldRules
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(64)     = @ObjectType;

    ;WITH Winning AS
    (
        SELECT
            d.FieldDefinitionId,
            d.FieldKey,
            ROW_NUMBER() OVER (
                PARTITION BY d.FieldKey
                ORDER BY CASE WHEN d.WorkspaceId = @WorkspaceIdLocal THEN 0 ELSE 1 END) AS RowRank
        FROM dbo.FieldDefinition AS d
        WHERE d.ObjectType = @ObjectTypeLocal
          AND d.IsDeleted = 0
          AND (d.WorkspaceId = @WorkspaceIdLocal OR d.Location = N'Global')
    )
    SELECT
        w.FieldKey       AS FieldKey,
        r.FieldRuleId    AS FieldRuleId,
        r.[Action]       AS [Action],
        r.WhenFieldKey   AS WhenFieldKey,
        r.Comparator     AS Comparator,
        r.CompareValue   AS CompareValue,
        r.ProduceValue   AS ProduceValue,
        r.SortOrder      AS SortOrder
    FROM Winning AS w
    INNER JOIN dbo.FieldRule AS r
        ON r.FieldDefinitionId = w.FieldDefinitionId
       AND r.IsDeleted = 0
    WHERE w.RowRank = 1
    ORDER BY w.FieldKey, r.SortOrder;
END;
GO
