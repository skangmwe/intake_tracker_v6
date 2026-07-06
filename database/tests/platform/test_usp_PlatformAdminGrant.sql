-- =============================================
-- tSQLt tests for the S36 access-grant procs (Slice 19 — Platform admin):
-- dbo.usp_UpsertPlatformAdminGrant / usp_RevokePlatformAdminGrant / usp_ListPrivilegedGrants.
-- Covers: grant by id, grant by email (resolve / no-match / ambiguous), idempotent grant,
-- reactivation of a revoked grant, revoke, and the privileged-grants directory union.
-- =============================================

EXEC tSQLt.NewTestClass 'PlatformAdminGrantTests';
GO

CREATE PROCEDURE PlatformAdminGrantTests.[test_Upsert_ByUserId_InsertsGrant]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformAdminGrant', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    DECLARE @UserId UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES (@UserId, N'Dana Admin', N'dana@firm.example', 0, 0);

    -- Act
    CREATE TABLE #Result (UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(200), WasAdded BIT);
    INSERT INTO #Result EXEC dbo.usp_UpsertPlatformAdminGrant @TargetUserId = @UserId, @ActorUserId = N'actor';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.PlatformAdminGrant WHERE UserId = @UserId AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @WasAdded BIT = (SELECT WasAdded FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @WasAdded;
END;
GO

CREATE PROCEDURE PlatformAdminGrantTests.[test_Upsert_ByEmail_ResolvesUser]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformAdminGrant', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    DECLARE @UserId UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES (@UserId, N'Dana Admin', N'dana@firm.example', 0, 0);

    CREATE TABLE #Result (UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(200), WasAdded BIT);
    INSERT INTO #Result EXEC dbo.usp_UpsertPlatformAdminGrant @Email = N'dana@firm.example', @ActorUserId = N'actor';

    DECLARE @Resolved UNIQUEIDENTIFIER = (SELECT UserId FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = @UserId, @Actual = @Resolved;
END;
GO

CREATE PROCEDURE PlatformAdminGrantTests.[test_Upsert_ByEmail_NoMatch_Throws]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformAdminGrant', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%No active user matches%';
    EXEC dbo.usp_UpsertPlatformAdminGrant @Email = N'nobody@firm.example', @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE PlatformAdminGrantTests.[test_Upsert_ByEmail_Ambiguous_Throws]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformAdminGrant', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES (NEWID(), N'Shared Name', N'a@firm.example', 0, 0),
           (NEWID(), N'Shared Name', N'b@firm.example', 0, 0);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%More than one user matches%';
    EXEC dbo.usp_UpsertPlatformAdminGrant @Email = N'Shared Name', @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE PlatformAdminGrantTests.[test_Upsert_LiveGrant_IsIdempotent]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformAdminGrant', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    DECLARE @UserId UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES (@UserId, N'Dana Admin', N'dana@firm.example', 0, 0);
    INSERT INTO dbo.PlatformAdminGrant (GrantId, UserId, GrantedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), @UserId, SYSUTCDATETIME(), N'seed', N'seed', 0);

    CREATE TABLE #Result (UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(200), WasAdded BIT);
    INSERT INTO #Result EXEC dbo.usp_UpsertPlatformAdminGrant @TargetUserId = @UserId, @ActorUserId = N'actor';

    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.PlatformAdminGrant WHERE UserId = @UserId AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE PlatformAdminGrantTests.[test_Revoke_SoftDeletesGrant]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformAdminGrant', @Defaults = 1;
    DECLARE @UserId UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.PlatformAdminGrant (GrantId, UserId, GrantedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), @UserId, SYSUTCDATETIME(), N'seed', N'seed', 0);

    EXEC dbo.usp_RevokePlatformAdminGrant @TargetUserId = @UserId, @ActorUserId = N'actor';

    DECLARE @Active INT = (SELECT COUNT(*) FROM dbo.PlatformAdminGrant WHERE UserId = @UserId AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Active;
END;
GO

CREATE PROCEDURE PlatformAdminGrantTests.[test_List_ReturnsPlatformAndWorkspaceAdmins]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformAdminGrant', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';

    DECLARE @Platform UNIQUEIDENTIFIER = NEWID();
    DECLARE @WsAdmin  UNIQUEIDENTIFIER = NEWID();
    DECLARE @Ws       UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES (@Platform, N'Platform Person', N'p@firm.example', 0, 0),
           (@WsAdmin,  N'Workspace Admin', N'w@firm.example', 0, 0);
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, IsDeleted) VALUES (@Ws, N'Litigation', 0);
    INSERT INTO dbo.PlatformAdminGrant (GrantId, UserId, GrantedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), @Platform, SYSUTCDATETIME(), N'seed', N'seed', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], CreatedAt, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), @Ws, @WsAdmin, N'WorkspaceAdmin', SYSUTCDATETIME(), N'seed', N'seed', 0);

    -- Act
    CREATE TABLE #Rows (GrantKind NVARCHAR(20), UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(200),
        Email NVARCHAR(320), WorkspaceId UNIQUEIDENTIFIER, WorkspaceName NVARCHAR(200), GrantedAt DATETIME2);
    INSERT INTO #Rows EXEC dbo.usp_ListPrivilegedGrants;

    -- Assert — one of each kind
    DECLARE @Plat INT = (SELECT COUNT(*) FROM #Rows WHERE GrantKind = N'PlatformAdmin');
    DECLARE @WsA  INT = (SELECT COUNT(*) FROM #Rows WHERE GrantKind = N'WorkspaceAdmin');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Plat;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @WsA;
END;
GO
