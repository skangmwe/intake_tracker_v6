-- =============================================
-- tSQLt tests for dbo.usp_ResolveOrigin (Slice 1 — Foundation).
-- Covers: known prefix resolves to workspace + name-at-mint, unknown prefix
--         returns NULL, malformed ID returns NULL. database-testing.md.
-- =============================================

EXEC tSQLt.NewTestClass 'ResolveOriginTests';
GO

CREATE PROCEDURE ResolveOriginTests.[test_KnownPrefixResolves]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, IsDeleted)
    VALUES (N'AIS', '1A150000-0000-4000-8000-000000000001', N'AI Solutions', 0);

    DECLARE @WorkspaceId UNIQUEIDENTIFIER, @Name NVARCHAR(200);
    DECLARE @ExpectedWorkspaceId UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    -- Act
    EXEC dbo.usp_ResolveOrigin
        @RecordId            = N'AIS-00000042',
        @WorkspaceId         = @WorkspaceId OUTPUT,
        @WorkspaceNameAtMint = @Name OUTPUT;

    -- Assert — compare as UNIQUEIDENTIFIER. tSQLt.AssertEquals is type-sensitive (sql_variant),
    -- so an NVARCHAR literal expected would not match a UNIQUEIDENTIFIER actual even when equal.
    EXEC tSQLt.AssertEquals @Expected = @ExpectedWorkspaceId, @Actual = @WorkspaceId;
    EXEC tSQLt.AssertEquals @Expected = N'AI Solutions', @Actual = @Name;
END;
GO

CREATE PROCEDURE ResolveOriginTests.[test_UnknownPrefixReturnsNull]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';   -- empty
    DECLARE @WorkspaceId UNIQUEIDENTIFIER, @Name NVARCHAR(200);

    -- Act
    EXEC dbo.usp_ResolveOrigin
        @RecordId            = N'ZZZ-00000001',
        @WorkspaceId         = @WorkspaceId OUTPUT,
        @WorkspaceNameAtMint = @Name OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @WorkspaceId;
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @Name;
END;
GO

CREATE PROCEDURE ResolveOriginTests.[test_MalformedIdReturnsNull]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, IsDeleted)
    VALUES (N'AIS', '1A150000-0000-4000-8000-000000000001', N'AI Solutions', 0);
    DECLARE @WorkspaceId UNIQUEIDENTIFIER, @Name NVARCHAR(200);

    -- Act — no dash, nothing to parse.
    EXEC dbo.usp_ResolveOrigin
        @RecordId            = N'NOPREFIX',
        @WorkspaceId         = @WorkspaceId OUTPUT,
        @WorkspaceNameAtMint = @Name OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @WorkspaceId;
END;
GO
