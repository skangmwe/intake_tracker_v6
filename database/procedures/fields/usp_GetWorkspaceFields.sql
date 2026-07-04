-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Returns the field definitions for one (WorkspaceId, ObjectType), with the
--              1:1 DerivedField header folded in (LEFT JOIN). One flat row per field,
--              bound in the API via FromSqlRaw to a keyless projection (api-data-access.md
--              — this LEFT JOIN takes it out of single-table EF CRUD). Options and rules
--              are read by their own procs and assembled in the service. Soft-deleted rows
--              excluded. Not an access-gate proc — the API enforces membership separately
--              (database-stored-procedures.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFields
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(16)     = @ObjectType;

    SELECT
        d.FieldDefinitionId    AS FieldDefinitionId,
        d.WorkspaceId          AS WorkspaceId,
        d.ObjectType           AS ObjectType,
        d.FieldKey             AS FieldKey,
        d.DisplayName          AS DisplayName,
        d.FieldType            AS FieldType,
        d.Category             AS Category,
        d.Section              AS Section,
        d.HelpText             AS HelpText,
        d.IsRequired           AS IsRequired,
        d.IsReadOnly           AS IsReadOnly,
        d.IsPlatformDefined    AS IsPlatformDefined,
        d.PlatformFieldKey     AS PlatformFieldKey,
        d.VisibleStagesJson    AS VisibleStagesJson,
        d.CrossingToFieldKey   AS CrossingToFieldKey,
        d.MinValue             AS MinValue,
        d.MaxValue             AS MaxValue,
        d.AllowNewValues       AS AllowNewValues,
        d.SortOrder            AS SortOrder,
        d.IsRetired            AS IsRetired,
        df.Kind                AS DerivedKind,
        df.Expression          AS DerivedExpression,
        df.DefaultValue        AS DerivedDefaultValue,
        d.CreatedAt            AS CreatedAt,
        d.UpdatedAt            AS UpdatedAt
    FROM dbo.FieldDefinition AS d
    LEFT JOIN dbo.DerivedField AS df
        ON df.FieldDefinitionId = d.FieldDefinitionId
       AND df.IsDeleted = 0
    WHERE d.WorkspaceId = @WorkspaceIdLocal
      AND d.ObjectType = @ObjectTypeLocal
      AND d.IsDeleted = 0
    ORDER BY d.SortOrder, d.DisplayName;
END;
GO
