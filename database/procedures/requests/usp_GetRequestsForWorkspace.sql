-- =============================================
-- Author:      surface-fields slice 3a (Request dynamic export)
-- Create Date: 2026-07-24
-- Description: Returns every request in a workspace, paginated, for the Request CSV export
--              (S28 export wizard). One row per request with its RecordId (the export identity)
--              and the whole FieldValues JSON map — the single source of every content/derivation
--              value, keyed by FieldKey. The API projects each column the workspace field catalog
--              defines out of this map, so the export surfaces every Request field (not just the
--              nine list columns). Ordered by RecordId for a stable file order.
--
--              Access: this is NOT an access-gate proc. ExportService gates the caller's Viewer
--              membership on @WorkspaceId before the export path runs (api-record-access.md — the
--              workspace scope IS the row-level entitlement; export never widens access, BS §22.4).
--              This is the same workspace-scoped read the existing Request export used
--              (RequestsService.QueryAsync is workspace-scoped, not user-filtered). Soft-deleted
--              requests excluded. Field values are Confidential — never logged (api-pii-handling.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetRequestsForWorkspace
    @WorkspaceId UNIQUEIDENTIFIER,
    @Page        INT,
    @PageSize    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Skip INT = (@Page - 1) * @PageSize;
    DECLARE @Take INT = @PageSize;

    SELECT
        r.RecordId,
        r.FieldValues
    FROM dbo.Requests AS r
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
    ORDER BY r.RecordId ASC
    OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
END;
GO
