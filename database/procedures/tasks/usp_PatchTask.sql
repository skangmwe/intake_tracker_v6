-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Sparse update of a Task (title, phase, assignee, status, Notes & decisions, or the
--              captured typed field's value). Each field carries a @Set* flag so "set to null" is
--              distinguishable from "leave unchanged". Access is gated by a membership join through
--              the task's workspace (api-record-access.md): a caller who cannot see the task's
--              parent record updates ZERO rows and the final SELECT returns nothing, so the API
--              answers 403 without disclosing existence (BS §22.6).
--
--              Status transitions stamp CompletedAt: 'Done' stamps now, any other status clears it
--              (blueprint: "checking a task off stamps today"). @SetTypedFieldValue edits only the
--              captured field's VALUE columns (the field's definition / label / type are fixed at
--              capture in usp_CreateTask — the prototype edits values inline, never the field). The
--              API passes exactly one FieldValue* (matching the field's kind); CK_Tasks_OneFieldValue
--              enforces the one-value invariant. Returns the updated task row (same projection as
--              usp_GetTasksForRequest).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_PatchTask
    @TaskId              UNIQUEIDENTIFIER,
    @UserId              UNIQUEIDENTIFIER,
    @SetTitle            BIT,
    @Title               NVARCHAR(400),
    @SetPhase            BIT,
    @Phase               NVARCHAR(32),
    @SetAssignee         BIT,
    @AssigneeUserId      UNIQUEIDENTIFIER,
    @SetStatus           BIT,
    @Status              NVARCHAR(16),
    @SetNotes            BIT,
    @Notes               NVARCHAR(MAX),
    @SetTypedFieldValue  BIT,
    @FieldValueUrl       NVARCHAR(2048),
    @FieldValueText      NVARCHAR(MAX),
    @FieldValueNumber    DECIMAL(18,4),
    @FieldValueDate      DATE,
    @FieldValueSelect    NVARCHAR(200),
    @FieldValueBool      BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Task UNIQUEIDENTIFIER = @TaskId;
    DECLARE @User UNIQUEIDENTIFIER = @UserId;
    DECLARE @Now  DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE t
        SET
            t.Title          = CASE WHEN @SetTitle = 1    THEN @Title          ELSE t.Title END,
            t.Phase          = CASE WHEN @SetPhase = 1     THEN @Phase          ELSE t.Phase END,
            t.AssigneeUserId = CASE WHEN @SetAssignee = 1  THEN @AssigneeUserId ELSE t.AssigneeUserId END,
            t.Status         = CASE WHEN @SetStatus = 1    THEN @Status         ELSE t.Status END,
            t.CompletedAt    = CASE
                                   WHEN @SetStatus = 1 AND @Status = N'Done' THEN @Now
                                   WHEN @SetStatus = 1                        THEN NULL
                                   ELSE t.CompletedAt
                               END,
            t.Notes          = CASE WHEN @SetNotes = 1 THEN @Notes ELSE t.Notes END,
            t.FieldValueUrl     = CASE WHEN @SetTypedFieldValue = 1 THEN @FieldValueUrl     ELSE t.FieldValueUrl END,
            t.FieldValueText    = CASE WHEN @SetTypedFieldValue = 1 THEN @FieldValueText    ELSE t.FieldValueText END,
            t.FieldValueNumber  = CASE WHEN @SetTypedFieldValue = 1 THEN @FieldValueNumber  ELSE t.FieldValueNumber END,
            t.FieldValueDate    = CASE WHEN @SetTypedFieldValue = 1 THEN @FieldValueDate    ELSE t.FieldValueDate END,
            t.FieldValueSelect  = CASE WHEN @SetTypedFieldValue = 1 THEN @FieldValueSelect  ELSE t.FieldValueSelect END,
            t.FieldValueBool    = CASE WHEN @SetTypedFieldValue = 1 THEN @FieldValueBool    ELSE t.FieldValueBool END,
            t.UpdatedAt      = @Now,
            t.UpdatedBy      = CAST(@User AS NVARCHAR(256))
        FROM dbo.Tasks AS t
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = t.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
        WHERE t.TaskId = @Task AND t.IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    -- Gated read-back: returns the row only if the caller can still see it (else empty → 403).
    SELECT
        t.TaskId, t.RecordId, t.WorkspaceId, t.Title, t.Phase, t.AssigneeUserId, t.Status,
        t.Notes, t.CompletedAt, t.SortOrder,
        t.FieldDefinitionId, t.FieldLabel, t.FieldType,
        t.FieldValueUrl, t.FieldValueText, t.FieldValueNumber, t.FieldValueDate, t.FieldValueSelect, t.FieldValueBool,
        t.CreatedAt
    FROM dbo.Tasks AS t
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = t.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
    WHERE t.TaskId = @Task AND t.IsDeleted = 0;
END;
GO
