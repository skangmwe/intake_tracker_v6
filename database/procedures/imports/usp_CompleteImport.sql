-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Stamps an import job terminal (BS §13). Sets the final @Status
--              (Completed | CompletedWithErrors | Failed), the row counts, and CompletedAt. Called
--              once by the import processor after every row has been recorded. Idempotent-safe: a
--              second call simply overwrites the same terminal values. No access gate — called only
--              by the trusted processor for a job it owns.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CompleteImport
    @ImportId    UNIQUEIDENTIFIER,
    @Status      NVARCHAR(24),
    @TotalRows   INT,
    @LandedRows  INT,
    @FlaggedRows INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Import  UNIQUEIDENTIFIER = @ImportId;
    DECLARE @Result  NVARCHAR(24)     = @Status;
    DECLARE @Total   INT              = @TotalRows;
    DECLARE @Landed  INT              = @LandedRows;
    DECLARE @Flagged INT              = @FlaggedRows;

    UPDATE dbo.Imports
    SET Status      = @Result,
        TotalRows   = @Total,
        LandedRows  = @Landed,
        FlaggedRows = @Flagged,
        CompletedAt = SYSUTCDATETIME(),
        UpdatedAt   = SYSUTCDATETIME()
    WHERE ImportId = @Import
      AND IsDeleted = 0;
END;
GO
