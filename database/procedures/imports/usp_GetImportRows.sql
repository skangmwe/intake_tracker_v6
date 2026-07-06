-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Reads an import's per-row report for the poll endpoint — every row that carries a
--              reason (hard failures AND Requestor-fallback warnings), newest-index first excluded;
--              ordered by RowIndex so the report table reads top-to-bottom (BS §13, S28). Access is
--              gated on the caller being a WorkspaceAdmin of the import's workspace: a forbidden or
--              non-existent import yields ZERO rows (403, never disclose — BS §22.6). Rows that
--              landed cleanly (no warning) are NOT returned — they are only counted (LandedRows on
--              the job), keeping the report focused on what needs attention.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetImportRows
    @ImportId UNIQUEIDENTIFIER,
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Import UNIQUEIDENTIFIER = @ImportId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;

    SELECT
        r.RowIndex,
        r.Outcome,
        r.RecordId,
        r.ReasonsJson
    FROM dbo.ImportRows AS r
    INNER JOIN dbo.Imports AS i
        ON i.ImportId = r.ImportId
       AND i.IsDeleted = 0
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = i.WorkspaceId
       AND m.UserId = @User
       AND m.Level = N'WorkspaceAdmin'
       AND m.IsDeleted = 0
    WHERE r.ImportId = @Import
      AND r.IsDeleted = 0
      AND r.ReasonsJson IS NOT NULL
    ORDER BY r.RowIndex ASC;
END;
GO
