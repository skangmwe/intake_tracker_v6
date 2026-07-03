-- =============================================
-- tSQLt tests for dbo.usp_UpsertUser (Slice 2 — Auth & app shell).
-- Covers: insert on first sign-in (Theme defaults to 'light'), refresh on a repeat
-- sign-in WITH the Theme preference preserved, and idempotency (no duplicate rows).
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'UpsertUserTests';
GO

CREATE PROCEDURE UpsertUserTests.[test_FirstSignIn_InsertsUserWithLightTheme]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    DECLARE @UserId UNIQUEIDENTIFIER = '22222222-2222-4222-8222-222222222222';

    -- Act
    EXEC dbo.usp_UpsertUser
        @UserId      = @UserId,
        @DisplayName = N'Priya Raman',
        @Email       = N'priya@mws.ai',
        @SignInAt    = '2026-07-03T13:00:00';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Users WHERE UserId = @UserId);
    DECLARE @Theme NVARCHAR(10) = (SELECT Theme FROM dbo.Users WHERE UserId = @UserId);
    DECLARE @Name NVARCHAR(200) = (SELECT DisplayName FROM dbo.Users WHERE UserId = @UserId);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    EXEC tSQLt.AssertEquals @Expected = N'light', @Actual = @Theme;
    EXEC tSQLt.AssertEquals @Expected = N'Priya Raman', @Actual = @Name;
END;
GO

CREATE PROCEDURE UpsertUserTests.[test_RepeatSignIn_RefreshesProfile_PreservesTheme]
AS
BEGIN
    -- Arrange — an existing user who has chosen the dark theme.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    DECLARE @UserId UNIQUEIDENTIFIER = '22222222-2222-4222-8222-222222222222';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, LastSignInAt, IsDisabled, Theme, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@UserId, N'Old Name', N'old@mws.ai', '2026-01-01T00:00:00', 0, N'dark', SYSUTCDATETIME(), SYSUTCDATETIME(), N'x', N'x', 0);

    -- Act
    EXEC dbo.usp_UpsertUser
        @UserId      = @UserId,
        @DisplayName = N'New Name',
        @Email       = N'new@mws.ai',
        @SignInAt    = '2026-07-03T13:00:00';

    -- Assert — profile fields updated, Theme preserved.
    DECLARE @Name NVARCHAR(200) = (SELECT DisplayName FROM dbo.Users WHERE UserId = @UserId);
    DECLARE @Email NVARCHAR(320) = (SELECT Email FROM dbo.Users WHERE UserId = @UserId);
    DECLARE @Theme NVARCHAR(10) = (SELECT Theme FROM dbo.Users WHERE UserId = @UserId);
    EXEC tSQLt.AssertEquals @Expected = N'New Name', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = N'new@mws.ai', @Actual = @Email;
    EXEC tSQLt.AssertEquals @Expected = N'dark', @Actual = @Theme;
END;
GO

CREATE PROCEDURE UpsertUserTests.[test_Idempotent_NoDuplicateRows]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    DECLARE @UserId UNIQUEIDENTIFIER = '22222222-2222-4222-8222-222222222222';

    -- Act — the same first-request upsert twice.
    EXEC dbo.usp_UpsertUser @UserId = @UserId, @DisplayName = N'Priya', @Email = N'p@mws.ai', @SignInAt = '2026-07-03T13:00:00';
    EXEC dbo.usp_UpsertUser @UserId = @UserId, @DisplayName = N'Priya', @Email = N'p@mws.ai', @SignInAt = '2026-07-03T14:00:00';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Users WHERE UserId = @UserId);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO
