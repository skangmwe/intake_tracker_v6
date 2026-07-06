-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Records one per-row outcome for an import (BS §13). Called by the in-process import
--              processor after it attempts to create the row's Request. @Outcome is 'Landed' (a
--              Request was created — @RecordId set) or 'Flagged' (a hard validation failure — no
--              record). @ReasonsJson (nullable) carries the `[{code,message,field}]` array — hard
--              failures on Flagged rows and Requestor-fallback warnings on Landed rows (never silent,
--              BS §13). No access gate here: the parent import row was already admin-gated at create
--              (usp_CreateImport) and this proc is only ever called by the trusted processor with an
--              @ImportId it just created. @ActorUserId is the importing admin (audit columns).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RecordImportRow
    @ImportId    UNIQUEIDENTIFIER,
    @RowIndex    INT,
    @Outcome     NVARCHAR(16),
    @RecordId    NVARCHAR(20),
    @ReasonsJson NVARCHAR(MAX),
    @ActorUserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Import   UNIQUEIDENTIFIER = @ImportId;
    DECLARE @Index    INT              = @RowIndex;
    DECLARE @Result   NVARCHAR(16)     = @Outcome;
    DECLARE @Record   NVARCHAR(20)     = @RecordId;
    DECLARE @Reasons  NVARCHAR(MAX)    = @ReasonsJson;
    DECLARE @ActorStr NVARCHAR(256)    = CAST(@ActorUserId AS NVARCHAR(256));

    INSERT INTO dbo.ImportRows
        (ImportRowId, ImportId, RowIndex, Outcome, RecordId, ReasonsJson, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Import, @Index, @Result, @Record, @Reasons, @ActorStr, @ActorStr);
END;
GO
