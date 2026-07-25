-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Returns every SelectOption for the Single-/Multi-select fields of one
--              (WorkspaceId, ObjectType), keyed by FieldKey so the API can group them
--              onto their fields in one pass. Soft-deleted rows excluded. Read-only
--              projection (database-stored-procedures.md).
--
--              Cross-workspace scope (Fields tab reconciliation): options are returned for
--              the workspace's own fields AND every Global field of the object type, so a
--              global select field renders its choices in every workspace. The winning field
--              per key (local over foreign-global) is resolved first so a colliding key never
--              double-lists options — mirrors the dedup in usp_GetWorkspaceFields.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFieldOptions
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
        w.FieldKey        AS FieldKey,
        s.SelectOptionId  AS SelectOptionId,
        s.OptionValue     AS OptionValue,
        s.OptionLabel     AS OptionLabel,
        s.SortOrder       AS SortOrder
    FROM Winning AS w
    INNER JOIN dbo.SelectOption AS s
        ON s.FieldDefinitionId = w.FieldDefinitionId
       AND s.IsDeleted = 0
    WHERE w.RowRank = 1
    ORDER BY w.FieldKey, s.SortOrder;
END;
GO
