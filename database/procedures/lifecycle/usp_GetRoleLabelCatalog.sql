-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Returns the platform-scope gate role-label catalog (S31 reads it for the
--              approver-slot and approver-team selectors; full CRUD is S37 / slice 19).
--              Not workspace-scoped. Soft-deleted rows excluded.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetRoleLabelCatalog
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        RoleLabelId AS RoleLabelId,
        Label       AS Label,
        SortOrder   AS SortOrder
    FROM dbo.RoleLabelCatalog
    WHERE IsDeleted = 0
    ORDER BY SortOrder, Label;
END;
GO
