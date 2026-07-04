-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Returns the tasks on a record that @UserId is entitled to see — access is baked
--              into the query via a JOIN to WorkspaceMembership (api-record-access.md: read paths
--              filter in the query). A record the caller cannot see, or one with no tasks, both
--              return zero rows; the API distinguishes them by first gating the parent record via
--              usp_GetRequestByIdForUser (null → 403) — an accessible record with no tasks returns
--              an empty list (200), not 403.
--
--              Order: open/locked tasks first, completed/cancelled sink to the bottom; within each
--              group by the per-record creation sequence (SortOrder), then TaskId as a stable
--              tiebreak (blueprint: "created order first, completed tasks sink to the bottom").
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTasksForRequest
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;

    SELECT
        t.TaskId,
        t.RecordId,
        t.WorkspaceId,
        t.Title,
        t.Phase,
        t.AssigneeUserId,
        t.Status,
        t.Notes,
        t.CompletedAt,
        t.SortOrder,
        t.FieldDefinitionId,
        t.FieldLabel,
        t.FieldType,
        t.FieldValueUrl,
        t.FieldValueText,
        t.FieldValueNumber,
        t.FieldValueDate,
        t.FieldValueSelect,
        t.FieldValueBool,
        t.CreatedAt
    FROM dbo.Tasks AS t
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = t.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
    WHERE t.RecordId = @Record
      AND t.IsDeleted = 0
    ORDER BY
        CASE WHEN t.Status IN (N'Done', N'Cancelled') THEN 1 ELSE 0 END ASC,
        t.SortOrder ASC,
        t.TaskId ASC;
END;
GO
