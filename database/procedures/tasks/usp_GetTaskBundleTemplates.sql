-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Returns the task-bundle templates for a workspace, for the composer's "Add bundle"
--              picker. Workspace membership is verified API-side by the access guard before this
--              runs, so the proc trusts @WorkspaceId scope (same pattern as usp_QueryRequests).
--              Ordered by SortOrder. TasksJson is returned raw for the API to project into the
--              TaskBundleTemplate.tasks[] array.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTaskBundleTemplates
    @WorkspaceId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws UNIQUEIDENTIFIER = @WorkspaceId;

    SELECT
        b.TaskBundleTemplateId,
        b.TemplateKey,
        b.Name,
        b.TasksJson,
        b.SortOrder
    FROM dbo.TaskBundleTemplate AS b
    WHERE b.WorkspaceId = @Ws
      AND b.IsDeleted = 0
    ORDER BY b.SortOrder ASC, b.Name ASC;
END;
GO
