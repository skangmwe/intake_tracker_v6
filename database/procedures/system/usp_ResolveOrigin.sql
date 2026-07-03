-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Resolves a record's Origin from its ID prefix against PrefixRegistry
--              (BS §6.7, §17.1). Parses the prefix (the substring before the first
--              '-') and returns the originating workspace via OUTPUT parameters.
--              Resolves for records minted under retired workspaces because the
--              registry row is immutable. OUTPUTs are NULL when the prefix is
--              unknown.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ResolveOrigin
    @RecordId              NVARCHAR(20),
    @WorkspaceId           UNIQUEIDENTIFIER OUTPUT,
    @WorkspaceNameAtMint   NVARCHAR(200)    OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20) = @RecordId;
    DECLARE @Prefix        NVARCHAR(16);
    DECLARE @DashPos       INT = CHARINDEX(N'-', @RecordIdLocal);

    SET @WorkspaceId = NULL;
    SET @WorkspaceNameAtMint = NULL;

    IF @DashPos <= 1
        RETURN; -- Malformed or prefix-less ID: nothing to resolve.

    SET @Prefix = LEFT(@RecordIdLocal, @DashPos - 1);

    SELECT @WorkspaceId = pr.WorkspaceId,
           @WorkspaceNameAtMint = pr.WorkspaceNameAtMint
    FROM dbo.PrefixRegistry pr
    WHERE pr.Prefix = @Prefix
      AND pr.IsDeleted = 0;
END;
GO
