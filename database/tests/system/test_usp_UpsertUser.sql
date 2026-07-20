-- =============================================
-- tSQLt tests for dbo.usp_UpsertUser (Slice 2 — Auth & app shell; S29 invitation acceptance).
-- Covers: insert on first sign-in (Theme defaults to 'light'), refresh on a repeat
-- sign-in WITH the Theme preference preserved, idempotency (no duplicate rows), and
-- acceptance of a pending invitation on first sign-in (S29 — membership created + invite Accepted).
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'UpsertUserTests';
GO

CREATE PROCEDURE UpsertUserTests.[test_FirstSignIn_InsertsUserWithLightTheme]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceInvitation';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
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
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceInvitation';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
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
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceInvitation';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @UserId UNIQUEIDENTIFIER = '22222222-2222-4222-8222-222222222222';

    -- Act — the same first-request upsert twice.
    EXEC dbo.usp_UpsertUser @UserId = @UserId, @DisplayName = N'Priya', @Email = N'p@mws.ai', @SignInAt = '2026-07-03T13:00:00';
    EXEC dbo.usp_UpsertUser @UserId = @UserId, @DisplayName = N'Priya', @Email = N'p@mws.ai', @SignInAt = '2026-07-03T14:00:00';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Users WHERE UserId = @UserId);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE UpsertUserTests.[test_FirstSignIn_AcceptsPendingInvitation]
AS
BEGIN
    -- Arrange — a pending invitation addressed to this user's email; a second invite in a workspace the
    -- user already belongs to must NOT create a duplicate membership but is still marked Accepted.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceInvitation';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @UserId UNIQUEIDENTIFIER = '22222222-2222-4222-8222-222222222222';
    DECLARE @WsNew  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @WsHave UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000002';
    DECLARE @Email  NVARCHAR(320)    = N'invitee@mws.ai';

    -- Already a live member of @WsHave; a redundant invite there should not duplicate the membership.
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @WsHave, @UserId, N'Member', 0);
    INSERT INTO dbo.WorkspaceInvitation (InvitationId, WorkspaceId, Email, [Level], [Status], IsDeleted)
    VALUES (NEWID(), @WsNew,  @Email, N'WorkspaceAdmin', N'Invited', 0),
           (NEWID(), @WsHave, @Email, N'Viewer',         N'Invited', 0);

    -- Act — first sign-in provisions the user AND accepts the invitations.
    EXEC dbo.usp_UpsertUser @UserId = @UserId, @DisplayName = N'Invitee', @Email = @Email, @SignInAt = '2026-07-20T13:00:00';

    -- Assert — a new membership was created for @WsNew at the invited level; @WsHave still has exactly one.
    EXEC tSQLt.AssertEquals @Expected = N'WorkspaceAdmin',
        @Actual = (SELECT [Level] FROM dbo.WorkspaceMembership WHERE WorkspaceId = @WsNew AND UserId = @UserId AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @WsHave AND UserId = @UserId AND IsDeleted = 0);
    -- Both invitations are marked Accepted; none remain Invited.
    EXEC tSQLt.AssertEquals @Expected = 0,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceInvitation WHERE Email = @Email AND [Status] = N'Invited');
    EXEC tSQLt.AssertEquals @Expected = 2,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceInvitation WHERE Email = @Email AND [Status] = N'Accepted');
END;
GO
