-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Reads one import job's status + counts for the poll endpoint (GET /imports/{id}),
--              gating on the caller being a WorkspaceAdmin of the import's workspace (BS §13). A
--              forbidden or non-existent import returns ZERO rows, so the API answers 403 without
--              disclosing existence (BS §22.6). BlobPath is intentionally NOT projected (it is an
--              internal pointer, never surfaced). The per-row report is read separately by
--              usp_GetImportRows.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetImportById
    @ImportId UNIQUEIDENTIFIER,
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Import UNIQUEIDENTIFIER = @ImportId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;

    SELECT
        i.ImportId,
        i.WorkspaceId,
        i.FileName,
        i.Status,
        i.TotalRows,
        i.LandedRows,
        i.FlaggedRows,
        i.CreatedRows,
        i.UpdatedRows,
        i.StartedByUserId,
        i.StartedAt,
        i.CompletedAt
    FROM dbo.Imports AS i
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = i.WorkspaceId
       AND m.UserId = @User
       AND m.Level = N'WorkspaceAdmin'
       AND m.IsDeleted = 0
    WHERE i.ImportId = @Import
      AND i.IsDeleted = 0;
END;
GO
