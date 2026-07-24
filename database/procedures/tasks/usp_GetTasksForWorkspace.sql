-- =============================================
-- Author:      task-export-fields (Task attributes — surface + export)
-- Create Date: 2026-07-23
-- Description: Returns every task in a workspace, paginated, for the Task CSV export
--              (S28 export wizard). One row per task with its parent Request id, phase,
--              status, notes, completed date, and the assignee's display name (LEFT JOIN
--              to dbo.Users so an unassigned task still exports). Ordered by parent record,
--              then per-record sequence, then TaskId as a stable tiebreak.
--
--              Access: this is NOT an access-gate proc. ExportService gates the caller's
--              Viewer membership on @WorkspaceId before calling into the export path
--              (api-record-access.md — the workspace scope IS the row-level entitlement;
--              export never widens access, BS §22.4). Soft-deleted tasks excluded. Titles
--              and notes are Confidential — never logged (api-pii-handling.md).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTasksForWorkspace
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
        t.TaskId,
        t.RecordId,
        t.Title,
        t.Phase,
        t.Status,
        t.Notes,
        t.CompletedAt,
        t.AssigneeUserId,
        u.DisplayName AS AssigneeName
    FROM dbo.Tasks AS t
    LEFT JOIN dbo.Users AS u
        ON u.UserId = t.AssigneeUserId AND u.IsDeleted = 0
    WHERE t.WorkspaceId = @Ws
      AND t.IsDeleted = 0
    ORDER BY t.RecordId ASC, t.SortOrder ASC, t.TaskId ASC
    OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
END;
GO
