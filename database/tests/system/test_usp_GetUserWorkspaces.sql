-- =============================================
-- tSQLt tests for dbo.usp_GetUserWorkspaces (Slice 2 — Auth & app shell).
-- Covers: memberships joined to their workspace, soft-delete exclusion (membership
-- and workspace), and the empty result for a user with no memberships.
-- database-testing.md (AAA, FakeTable, AssertEqualsTable).
-- =============================================

EXEC tSQLt.NewTestClass 'GetUserWorkspacesTests';
GO

CREATE PROCEDURE GetUserWorkspacesTests.[test_ReturnsMembershipJoinedToWorkspace]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    DECLARE @UserId UNIQUEIDENTIFIER = '33333333-3333-4333-8333-333333333333';
    DECLARE @WsId UNIQUEIDENTIFIER = '44444444-4444-4444-8444-444444444444';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, IsDeleted)
    VALUES (@WsId, N'AI Solutions', N'ai-solutions', N'AIS', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, Level, IsDashboardViewer, BoundDashboardId, IsDeleted)
    VALUES (NEWID(), @WsId, @UserId, N'Member', 0, NULL, 0);

    CREATE TABLE #Actual (WorkspaceId UNIQUEIDENTIFIER, WorkspaceName NVARCHAR(200), WorkspaceKind NVARCHAR(40),
        WorkspacePrefix NVARCHAR(16), Level NVARCHAR(40), IsDashboardViewer BIT, BoundDashboardId UNIQUEIDENTIFIER);
    CREATE TABLE #Expected (WorkspaceId UNIQUEIDENTIFIER, WorkspaceName NVARCHAR(200), WorkspaceKind NVARCHAR(40),
        WorkspacePrefix NVARCHAR(16), Level NVARCHAR(40), IsDashboardViewer BIT, BoundDashboardId UNIQUEIDENTIFIER);
    INSERT INTO #Expected VALUES (@WsId, N'AI Solutions', N'ai-solutions', N'AIS', N'Member', 0, NULL);

    -- Act
    INSERT INTO #Actual EXEC dbo.usp_GetUserWorkspaces @UserId = @UserId;

    -- Assert
    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

CREATE PROCEDURE GetUserWorkspacesTests.[test_ExcludesSoftDeletedMembershipAndWorkspace]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    DECLARE @UserId UNIQUEIDENTIFIER = '33333333-3333-4333-8333-333333333333';
    DECLARE @LiveWs UNIQUEIDENTIFIER = '44444444-4444-4444-8444-444444444444';
    DECLARE @DeadWs UNIQUEIDENTIFIER = '55555555-5555-4555-8555-555555555555';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, IsDeleted)
    VALUES (@LiveWs, N'Live', N'pg-dept', N'LIV', 0),
           (@DeadWs, N'Dead', N'pg-dept', N'DED', 1);   -- soft-deleted workspace

    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, Level, IsDashboardViewer, BoundDashboardId, IsDeleted)
    VALUES (NEWID(), @LiveWs, @UserId, N'Member', 0, NULL, 1),   -- soft-deleted membership on a live workspace
           (NEWID(), @DeadWs, @UserId, N'Member', 0, NULL, 0);   -- live membership on a soft-deleted workspace

    CREATE TABLE #Actual (WorkspaceId UNIQUEIDENTIFIER, WorkspaceName NVARCHAR(200), WorkspaceKind NVARCHAR(40),
        WorkspacePrefix NVARCHAR(16), Level NVARCHAR(40), IsDashboardViewer BIT, BoundDashboardId UNIQUEIDENTIFIER);

    -- Act
    INSERT INTO #Actual EXEC dbo.usp_GetUserWorkspaces @UserId = @UserId;

    -- Assert — nothing survives the soft-delete filters.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE GetUserWorkspacesTests.[test_UnknownUser_ReturnsNoRows]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';

    CREATE TABLE #Actual (WorkspaceId UNIQUEIDENTIFIER, WorkspaceName NVARCHAR(200), WorkspaceKind NVARCHAR(40),
        WorkspacePrefix NVARCHAR(16), Level NVARCHAR(40), IsDashboardViewer BIT, BoundDashboardId UNIQUEIDENTIFIER);

    -- Act
    INSERT INTO #Actual EXEC dbo.usp_GetUserWorkspaces @UserId = '99999999-9999-4999-8999-999999999999';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO
