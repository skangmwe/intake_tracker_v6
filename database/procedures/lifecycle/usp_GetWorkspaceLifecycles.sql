-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Returns the lifecycles for one workspace (S31). One flat row per lifecycle;
--              stages/gates/slots are read by their own procs and assembled in the service.
--              Soft-deleted rows excluded. Not an access-gate proc — the API enforces
--              membership separately (database-stored-procedures.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWorkspaceLifecycles
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        LifecycleId AS LifecycleId,
        Name        AS Name,
        RequestType AS RequestType,
        IsDefault   AS IsDefault,
        SortOrder   AS SortOrder
    FROM dbo.Lifecycle
    WHERE WorkspaceId = @WorkspaceIdLocal
      AND IsDeleted = 0
    ORDER BY SortOrder, Name;
END;
GO
