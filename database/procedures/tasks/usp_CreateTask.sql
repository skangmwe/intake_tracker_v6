-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Creates one Task under a Request, gating on the caller's membership of the record's
--              workspace (api-record-access.md — the same access baked into every read path). A
--              caller who is not a member of the record's workspace inserts ZERO rows and the
--              proc returns an empty result set, so the API answers 403 without disclosing record
--              existence (BS §22.6).
--
--              SortOrder is the next per-record creation sequence. The typed field is passed as a
--              FieldType plus the single matching FieldValue* (the caller sets exactly one, per
--              CK_Tasks_OneFieldValue). Returns the created task row (same projection as
--              usp_GetTasksForRequest) via a final SELECT.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateTask
    @RecordId          NVARCHAR(20),
    @WorkspaceId       UNIQUEIDENTIFIER,
    @Author            UNIQUEIDENTIFIER,
    @Title             NVARCHAR(400),
    @Phase             NVARCHAR(32),
    @AssigneeUserId    UNIQUEIDENTIFIER,
    @DueDate           DATE = NULL,
    @FieldDefinitionId UNIQUEIDENTIFIER,
    @FieldLabel        NVARCHAR(200),
    @FieldType         NVARCHAR(16),
    @FieldValueUrl     NVARCHAR(2048),
    @FieldValueText    NVARCHAR(MAX),
    @FieldValueNumber  DECIMAL(18,4),
    @FieldValueDate    DATE,
    @FieldValueSelect  NVARCHAR(200),
    @FieldValueBool    BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @By     UNIQUEIDENTIFIER = @Author;
    DECLARE @ByText NVARCHAR(256)    = CAST(@Author AS NVARCHAR(256));

    -- Access gate: the record must exist on a workspace the caller is a member of.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @By AND m.IsDeleted = 0
        WHERE r.RecordId = @Record AND r.WorkspaceId = @Ws AND r.IsDeleted = 0)
        RETURN;

    DECLARE @NewId UNIQUEIDENTIFIER = NEWID();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Next INT =
            (SELECT ISNULL(MAX(t.SortOrder), 0) + 1
             FROM dbo.Tasks AS t
             WHERE t.RecordId = @Record AND t.WorkspaceId = @Ws AND t.IsDeleted = 0);

        -- IsDeleted is set explicitly (not left to the column default) because the SortOrder
        -- sequence subquery above filters on IsDeleted = 0 — the new row must satisfy it.
        INSERT INTO dbo.Tasks
            (TaskId, RecordId, WorkspaceId, Title, Phase, AssigneeUserId, Status, DueDate, SortOrder,
             FieldDefinitionId, FieldLabel, FieldType,
             FieldValueUrl, FieldValueText, FieldValueNumber, FieldValueDate, FieldValueSelect, FieldValueBool,
             IsDeleted, CreatedBy, UpdatedBy)
        VALUES
            (@NewId, @Record, @Ws, @Title, @Phase, @AssigneeUserId, N'Open', @DueDate, @Next,
             @FieldDefinitionId, @FieldLabel, @FieldType,
             @FieldValueUrl, @FieldValueText, @FieldValueNumber, @FieldValueDate, @FieldValueSelect, @FieldValueBool,
             0, @ByText, @ByText);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT
        t.TaskId, t.RecordId, t.WorkspaceId, t.Title, t.Phase, t.AssigneeUserId, t.Status,
        t.Notes, t.CompletedAt, t.DueDate, t.SortOrder,
        t.FieldDefinitionId, t.FieldLabel, t.FieldType,
        t.FieldValueUrl, t.FieldValueText, t.FieldValueNumber, t.FieldValueDate, t.FieldValueSelect, t.FieldValueBool,
        t.CreatedAt
    FROM dbo.Tasks AS t
    WHERE t.TaskId = @NewId;
END;
GO
