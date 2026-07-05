-- =============================================
-- Author:      /dev-build-application (Slice 10 — Closure)
-- Create Date: 2026-07-04
-- Description: Closes a Request with an Outcome (BS §8). The outcome is written into the record's
--              FieldValues JSON (the same store Hold uses) — no dedicated columns — so the existing
--              Display Status / Mirror Status derivations pick it up (they read $.outcome first).
--              Workspace level is checked API-side before this runs; @WorkspaceId disambiguates the
--              two rows an escalated record has so closure lands on the caller's side. Not found →
--              THROW 50043 (API maps to 403, never discloses existence). No result set — the caller
--              re-reads via usp_GetRequestByIdForUser. Closure fires the closure event API-side.
--
--              @OutcomeKind  = 'delivery' | 'local'
--              @OutcomeValue = Live | Declined | Withdrawn | Duplicate | NotPursued
--              @DuplicateOfRecordId is required by the API when @OutcomeValue = 'Duplicate'.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CloseRequest
    @RecordId            NVARCHAR(20),
    @WorkspaceId         UNIQUEIDENTIFIER,
    @OutcomeKind         NVARCHAR(16),
    @OutcomeValue        NVARCHAR(32),
    @Notes               NVARCHAR(MAX) = NULL,
    @DuplicateOfRecordId NVARCHAR(20) = NULL,
    @ActorUserId         NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @Ws            UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Kind          NVARCHAR(16)     = @OutcomeKind;
    DECLARE @Value         NVARCHAR(32)     = @OutcomeValue;
    DECLARE @Notes2        NVARCHAR(MAX)    = @Notes;
    DECLARE @DupOf         NVARCHAR(20)     = @DuplicateOfRecordId;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.Requests WITH (UPDLOCK, ROWLOCK)
            WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0)
            THROW 50043, N'usp_CloseRequest: request not found.', 1;

        UPDATE dbo.Requests
        SET FieldValues =
                JSON_MODIFY(
                    JSON_MODIFY(
                        JSON_MODIFY(
                            JSON_MODIFY(FieldValues, N'$.outcome', @Value),
                            N'$.outcomeKind', @Kind),
                        N'$.outcomeNotes', @Notes2),
                    N'$.duplicateOfRecordId', @DupOf),
            UpdatedBy = @Actor,
            UpdatedAt = SYSUTCDATETIME()
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
