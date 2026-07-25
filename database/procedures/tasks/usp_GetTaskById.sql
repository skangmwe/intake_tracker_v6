-- =============================================
-- Author:      /dev-build-application (Slice 10 — Promote to request)
-- Create Date: 2026-07-04
-- Description: Returns a single task by id that @UserId is entitled to see — access is baked into
--              the query via a JOIN to WorkspaceMembership on the task's workspace (the same gate
--              usp_GetTasksForRequest uses). A task the caller cannot see, or a non-existent id,
--              both return zero rows → the API returns 403 (never discloses existence, BS §22.6).
--              Projects the full TaskRow shape so Promote can read the parent record + workspace.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTaskById
    @TaskId UNIQUEIDENTIFIER,
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @TaskIdLocal UNIQUEIDENTIFIER = @TaskId;
    DECLARE @User        UNIQUEIDENTIFIER = @UserId;

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
        t.DueDate,
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
    WHERE t.TaskId = @TaskIdLocal
      AND t.IsDeleted = 0;
END;
GO
