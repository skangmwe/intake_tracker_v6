-- =============================================
-- Author:      surface-fields slice 3b (Feature dynamic export)
-- Create Date: 2026-07-24
-- Description: Returns every feature in a workspace, paginated, for the Feature CSV export
--              (S28 export wizard). One row per feature with its RecordId (the export identity)
--              and the whole FieldValues JSON map — the single source of every content value,
--              keyed by field key. The API projects each column the Feature field catalog defines
--              out of this map, so the export surfaces every Feature field. Ordered by RecordId for
--              a stable file order.
--
--              Access: this is NOT an access-gate proc. FeaturesService resolves the AI Solutions
--              hub workspace and gates the caller's Viewer membership on it before calling into the
--              export path (the hub scope IS the row-level entitlement; export never widens access,
--              BS §22.4). Soft-deleted features excluded. Field values are Confidential — never
--              logged (api-pii-handling.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetFeaturesForWorkspace
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
        f.RecordId,
        f.FieldValues
    FROM dbo.Features AS f
    WHERE f.WorkspaceId = @Ws
      AND f.IsDeleted = 0
    ORDER BY f.RecordId ASC
    OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
END;
GO
