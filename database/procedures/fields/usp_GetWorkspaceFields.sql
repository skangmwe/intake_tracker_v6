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
--
--              Cross-workspace scope (Fields tab reconciliation): the result set is the
--              workspace's own fields UNION every Global field (Location = 'Global') of the
--              same object type from any workspace. A workspace's own field wins when a key
--              collides with a foreign Global field of the same key (IsLocal DESC), so a
--              local override is never shadowed and the key never appears twice.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFields
    @WorkspaceId UNIQUEIDENTIFIER,
    @ObjectType  NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @ObjectTypeLocal  NVARCHAR(64)     = @ObjectType;

    ;WITH Scoped AS
    (
        SELECT
            d.FieldDefinitionId,
            d.WorkspaceId,
            d.ObjectType,
            d.FieldKey,
            d.DisplayName,
            d.FieldType,
            d.Category,
            d.Section,
            d.HelpText,
            d.IsRequired,
            d.IsReadOnly,
            d.IsPlatformDefined,
            d.IsSystemProvisioned,
            d.PlatformFieldKey,
            d.Location,
            d.VisibleStagesJson,
            d.CrossingToFieldKey,
            d.MinValue,
            d.MaxValue,
            d.AllowNewValues,
            d.SortOrder,
            d.IsRetired,
            d.CreatedAt,
            d.UpdatedAt,
            CAST(CASE WHEN d.WorkspaceId = @WorkspaceIdLocal THEN 1 ELSE 0 END AS BIT) AS IsLocal,
            ROW_NUMBER() OVER (
                PARTITION BY d.FieldKey
                ORDER BY CASE WHEN d.WorkspaceId = @WorkspaceIdLocal THEN 0 ELSE 1 END) AS RowRank
        FROM dbo.FieldDefinition AS d
        WHERE d.ObjectType = @ObjectTypeLocal
          AND d.IsDeleted = 0
          AND (d.WorkspaceId = @WorkspaceIdLocal OR d.Location = N'Global')
    )
    SELECT
        s.FieldDefinitionId    AS FieldDefinitionId,
        s.WorkspaceId          AS WorkspaceId,
        s.ObjectType           AS ObjectType,
        s.FieldKey             AS FieldKey,
        s.DisplayName          AS DisplayName,
        s.FieldType            AS FieldType,
        s.Category             AS Category,
        s.Section              AS Section,
        s.HelpText             AS HelpText,
        s.IsRequired           AS IsRequired,
        s.IsReadOnly           AS IsReadOnly,
        s.IsPlatformDefined    AS IsPlatformDefined,
        s.IsSystemProvisioned  AS IsSystemProvisioned,
        s.PlatformFieldKey     AS PlatformFieldKey,
        s.Location             AS Location,
        s.VisibleStagesJson    AS VisibleStagesJson,
        s.CrossingToFieldKey   AS CrossingToFieldKey,
        s.MinValue             AS MinValue,
        s.MaxValue             AS MaxValue,
        s.AllowNewValues       AS AllowNewValues,
        s.SortOrder            AS SortOrder,
        s.IsRetired            AS IsRetired,
        s.IsLocal              AS IsLocal,
        df.Kind                AS DerivedKind,
        df.Expression          AS DerivedExpression,
        df.DefaultValue        AS DerivedDefaultValue,
        s.CreatedAt            AS CreatedAt,
        s.UpdatedAt            AS UpdatedAt
    FROM Scoped AS s
    LEFT JOIN dbo.DerivedField AS df
        ON df.FieldDefinitionId = s.FieldDefinitionId
       AND df.IsDeleted = 0
    WHERE s.RowRank = 1
    ORDER BY s.SortOrder, s.DisplayName;
END;
GO
