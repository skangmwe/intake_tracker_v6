-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Atomically mints the next record ID for a workspace — PREFIX-NNNNNNNN
--              (BS §6.7). Increments Workspaces.NextSequence under a row lock and
--              returns the formatted ID via an OUTPUT parameter. First minted record
--              is PREFIX-00000001. Called on every mint (in-app and CSV import share
--              the same counter, so concurrent callers never collide).
--
--              No explicit transaction: the mint is a single UPDATE statement (atomic
--              on its own) and is designed to run INSIDE the caller's transaction
--              (mint -> insert record). Managing/ROLLBACKing a transaction here would
--              incorrectly unwind the caller's work. SET XACT_ABORT ON aborts the
--              statement and propagates on error.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_MintRecordId
    @WorkspaceId UNIQUEIDENTIFIER,
    @RecordId    NVARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Copy parameters into locals (parameter-sniffing mitigation).
    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @NewSequence      BIGINT;
    DECLARE @Prefix           NVARCHAR(16);

    -- Atomic read-and-increment: the UPDATE takes the row lock and assigns the
    -- post-increment value + prefix to locals in a single statement.
    UPDATE dbo.Workspaces WITH (ROWLOCK)
    SET @NewSequence = NextSequence = NextSequence + 1,
        @Prefix      = Prefix
    WHERE WorkspaceId = @WorkspaceIdLocal
      AND IsDeleted = 0;

    IF @NewSequence IS NULL
        THROW 50010, N'usp_MintRecordId: workspace not found or is deleted.', 1;

    SET @RecordId = @Prefix + N'-' + RIGHT(N'00000000' + CAST(@NewSequence AS NVARCHAR(20)), 8);
END;
GO
