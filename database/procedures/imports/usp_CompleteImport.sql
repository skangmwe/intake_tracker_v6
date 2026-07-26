-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Stamps an import job terminal (BS §13). Sets the final @Status
--              (Completed | CompletedWithErrors | Failed), the row counts, and CompletedAt. Called
--              once by the import processor after every row has been recorded. Idempotent-safe: a
--              second call simply overwrites the same terminal values. No access gate — called only
--              by the trusted processor for a job it owns.
--              @CreatedRows / @UpdatedRows (custom-object import upsert, default 0) report how many
--              landed rows created a new record vs updated an existing one; a create-only import
--              caller that hasn't been updated yet leaves both at 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CompleteImport
    @ImportId    UNIQUEIDENTIFIER,
    @Status      NVARCHAR(24),
    @TotalRows   INT,
    @LandedRows  INT,
    @FlaggedRows INT,
    @CreatedRows INT = 0,
    @UpdatedRows INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Import  UNIQUEIDENTIFIER = @ImportId;
    DECLARE @Result  NVARCHAR(24)     = @Status;
    DECLARE @Total   INT              = @TotalRows;
    DECLARE @Landed  INT              = @LandedRows;
    DECLARE @Flagged INT              = @FlaggedRows;
    DECLARE @Created INT              = @CreatedRows;
    DECLARE @Updated INT              = @UpdatedRows;

    UPDATE dbo.Imports
    SET Status      = @Result,
        TotalRows   = @Total,
        LandedRows  = @Landed,
        FlaggedRows = @Flagged,
        CreatedRows = @Created,
        UpdatedRows = @Updated,
        CompletedAt = SYSUTCDATETIME(),
        UpdatedAt   = SYSUTCDATETIME()
    WHERE ImportId = @Import
      AND IsDeleted = 0;
END;
GO
