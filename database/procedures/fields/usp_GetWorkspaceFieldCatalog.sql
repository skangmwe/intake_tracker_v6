-- =============================================
-- Author:      /dev-build-application (Slice — Fields tab reconciliation)
-- Create Date: 2026-07-21
-- Description: Flat, all-object-types field catalog for one workspace — the read behind the
--              reconciled S30 Fields tab table (FIELD · KEY · TYPE · OBJECT · LOCATION ·
--              REQUIRED · SOURCE · STATUS). One lightweight row per stored field across every
--              object type, without the option/rule/derived children (the table does not show
--              them; the editor loads them per object type on open).
--
--              Scope: the workspace's own fields UNION every Global field (Location = 'Global')
--              of any workspace. A local field wins over a foreign-global field of the same
--              (object type, key) — IsLocal-first — so a key is never listed twice.
--
--              The five read-only system auto-fields (Record ID / Name / Date created / Last
--              updated / Created by) are NOT returned here — they are synthesised per object in
--              the API (FieldSchemaService) so they need no per-workspace rows. Soft-deleted
--              rows excluded. Not an access-gate proc — the controller gates membership.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceFieldCatalog
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;

    ;WITH Scoped AS
    (
        SELECT
            d.FieldDefinitionId,
            d.WorkspaceId,
            d.ObjectType,
            d.FieldKey,
            d.DisplayName,
            d.FieldType,
            d.Location,
            d.IsRequired,
            d.IsReadOnly,
            d.IsPlatformDefined,
            d.IsSystemProvisioned,
            d.IsRetired,
            d.SortOrder,
            CAST(CASE WHEN d.WorkspaceId = @WorkspaceIdLocal THEN 1 ELSE 0 END AS BIT) AS IsLocal,
            ROW_NUMBER() OVER (
                PARTITION BY d.ObjectType, d.FieldKey
                ORDER BY CASE WHEN d.WorkspaceId = @WorkspaceIdLocal THEN 0 ELSE 1 END) AS RowRank
        FROM dbo.FieldDefinition AS d
        WHERE d.IsDeleted = 0
          AND (d.WorkspaceId = @WorkspaceIdLocal OR d.Location = N'Global')
    )
    SELECT
        s.FieldDefinitionId    AS FieldDefinitionId,
        s.WorkspaceId          AS WorkspaceId,
        s.ObjectType           AS ObjectType,
        s.FieldKey             AS FieldKey,
        s.DisplayName          AS DisplayName,
        s.FieldType            AS FieldType,
        s.Location             AS Location,
        s.IsRequired           AS IsRequired,
        s.IsReadOnly           AS IsReadOnly,
        s.IsPlatformDefined    AS IsPlatformDefined,
        s.IsSystemProvisioned  AS IsSystemProvisioned,
        s.IsRetired            AS IsRetired,
        s.IsLocal              AS IsLocal
    FROM Scoped AS s
    WHERE s.RowRank = 1
    ORDER BY s.ObjectType, s.SortOrder, s.DisplayName;
END;
GO
