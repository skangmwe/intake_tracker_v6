-- =============================================
-- Author:      /dev-build-application (Slice 24 — admin-editable crossing map, S35)
-- Create Date: 2026-07-06
-- Description: Confirms a proposed crossing-field mapping (BS §6.2) — Status 'Proposed' -> 'Confirmed'.
--              A mapping is live (crosses on escalation) only once confirmed. Not an access-gate proc:
--              the controller gates on Platform admin OR the AI-Solutions workspace admin. Guards
--              (validated before the transaction — tSQLt-safe):
--                50086 — the mapping is missing / soft-deleted / not in the Proposed state.
--                50087 — a field on either side was retired since the proposal (a retired field can't cross).
--              Returns the confirmed mapping resolved to display fields (single result set).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ConfirmCrossingMap
    @CrossingMapId UNIQUEIDENTIFIER,
    @ActorUserId   NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id    UNIQUEIDENTIFIER = @CrossingMapId;
    DECLARE @Actor NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();

    DECLARE @Status NVARCHAR(16), @PgId UNIQUEIDENTIFIER, @AiId UNIQUEIDENTIFIER;
    SELECT @Status = Status, @PgId = PgFieldDefinitionId, @AiId = AiFieldDefinitionId
    FROM dbo.CrossingMap
    WHERE CrossingMapId = @Id AND IsDeleted = 0;

    IF @Status IS NULL OR @Status <> N'Proposed'
        THROW 50086, 'That mapping is not awaiting confirmation.', 1;

    IF EXISTS (SELECT 1 FROM dbo.FieldDefinition
               WHERE FieldDefinitionId IN (@PgId, @AiId) AND (IsRetired = 1 OR IsDeleted = 1))
        THROW 50087, 'A field in this mapping has been retired and cannot be confirmed.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.CrossingMap
        SET Status = N'Confirmed', ConfirmedByUserId = @Actor, ConfirmedAt = @Now,
            UpdatedBy = @Actor, UpdatedAt = @Now
        WHERE CrossingMapId = @Id AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT
        cm.CrossingMapId,
        pg.FieldKey         AS SourceFieldKey,
        pg.DisplayName      AS SourceDisplayName,
        pg.FieldType        AS SourceFieldType,
        ai.FieldKey         AS TargetFieldKey,
        ai.DisplayName      AS TargetDisplayName,
        ai.FieldType        AS TargetFieldType,
        cm.Status,
        cm.OptionCorrespondenceJson,
        cm.ConfirmedByUserId,
        cm.ConfirmedAt
    FROM dbo.CrossingMap AS cm
    INNER JOIN dbo.FieldDefinition AS pg ON pg.FieldDefinitionId = cm.PgFieldDefinitionId
    INNER JOIN dbo.FieldDefinition AS ai ON ai.FieldDefinitionId = cm.AiFieldDefinitionId
    WHERE cm.CrossingMapId = @Id;
END;
GO
