-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Applies a task-bundle template to a Request — appends the template's task set as
--              Open tasks with the right phase (blueprint: "applying a template appends its full
--              task set with the right phase"). Gates on the caller's membership of the record's
--              workspace (api-record-access.md); a caller who cannot see the record inserts ZERO
--              rows and the proc returns an empty result set (API answers 403 upstream). If the
--              template does not exist for the workspace, nothing is inserted and the result set
--              is empty — the API maps that (on an otherwise-accessible record) to a 400.
--
--              Tasks are inserted set-based via OPENJSON, preserving the template's array order in
--              SortOrder (base + array index). Returns the created rows in SortOrder (same
--              projection as usp_GetTasksForRequest).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ApplyTaskBundle
    @RecordId         NVARCHAR(20),
    @WorkspaceId      UNIQUEIDENTIFIER,
    @Author           UNIQUEIDENTIFIER,
    @BundleTemplateId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @By     UNIQUEIDENTIFIER = @Author;
    DECLARE @ByText NVARCHAR(256)    = CAST(@Author AS NVARCHAR(256));
    DECLARE @Bundle UNIQUEIDENTIFIER = @BundleTemplateId;

    DECLARE @Created TABLE (TaskId UNIQUEIDENTIFIER);

    -- Access gate: the record must exist on a workspace the caller is a member of.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @By AND m.IsDeleted = 0
        WHERE r.RecordId = @Record AND r.WorkspaceId = @Ws AND r.IsDeleted = 0)
        RETURN;

    -- Template must belong to the same workspace (never applies a foreign template).
    DECLARE @TasksJson NVARCHAR(MAX) =
        (SELECT b.TasksJson FROM dbo.TaskBundleTemplate AS b
         WHERE b.TaskBundleTemplateId = @Bundle AND b.WorkspaceId = @Ws AND b.IsDeleted = 0);

    IF @TasksJson IS NULL OR ISJSON(@TasksJson) <> 1
        RETURN;  -- Unknown / foreign bundle → empty result → API 400.

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Base INT =
            (SELECT ISNULL(MAX(t.SortOrder), 0)
             FROM dbo.Tasks AS t
             WHERE t.RecordId = @Record AND t.WorkspaceId = @Ws AND t.IsDeleted = 0);

        -- IsDeleted is set explicitly (not left to the column default) because the SortOrder base
        -- above filters on IsDeleted = 0 — the appended rows must satisfy it.
        INSERT INTO dbo.Tasks
            (TaskId, RecordId, WorkspaceId, Title, Phase, AssigneeUserId, Status, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
        OUTPUT inserted.TaskId INTO @Created (TaskId)
        SELECT
            NEWID(),
            @Record,
            @Ws,
            LEFT(JSON_VALUE(j.value, N'$.title'), 400),
            ISNULL(NULLIF(JSON_VALUE(j.value, N'$.phase'), N''), N'Unphased'),
            @By,
            N'Open',
            @Base + CAST(j.[key] AS INT) + 1,
            0,
            @ByText,
            @ByText
        FROM OPENJSON(@TasksJson) AS j
        WHERE JSON_VALUE(j.value, N'$.title') IS NOT NULL;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT
        t.TaskId, t.RecordId, t.WorkspaceId, t.Title, t.Phase, t.AssigneeUserId, t.Status,
        t.Notes, t.CompletedAt, t.SortOrder,
        t.FieldDefinitionId, t.FieldLabel, t.FieldType,
        t.FieldValueUrl, t.FieldValueText, t.FieldValueNumber, t.FieldValueDate, t.FieldValueSelect, t.FieldValueBool,
        t.CreatedAt
    FROM dbo.Tasks AS t
    INNER JOIN @Created AS c ON c.TaskId = t.TaskId
    ORDER BY t.SortOrder ASC, t.TaskId ASC;
END;
GO
