-- =============================================
-- tSQLt tests for dbo.usp_GetWorkspaceApproverTeams (S29 Approver teams read).
-- Covers: the roster returns RoleLabel + UserId + DisplayName + Email for the workspace's
-- live memberships, scopes to the workspace, and excludes soft-deleted rows.
-- =============================================

EXEC tSQLt.NewTestClass 'GetWorkspaceApproverTeamsTests';
GO

CREATE PROCEDURE GetWorkspaceApproverTeamsTests.[test_ReturnsMemberDisplayNameAndEmail]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000AA';

    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted)
    VALUES (@U, N'Priya Raman', N'priya.raman@example.com', 0);
    INSERT INTO dbo.ApproverTeamMembership (ApproverTeamMembershipId, WorkspaceId, RoleLabel, UserId, IsDeleted)
    VALUES (NEWID(), @Ws, N'InfoSec', @U, 0);

    CREATE TABLE #Expected (RoleLabel NVARCHAR(120), UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(256), Email NVARCHAR(256));
    INSERT INTO #Expected (RoleLabel, UserId, DisplayName, Email)
    VALUES (N'InfoSec', @U, N'Priya Raman', N'priya.raman@example.com');

    CREATE TABLE #Actual (RoleLabel NVARCHAR(120), UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(256), Email NVARCHAR(256));

    -- Act — INSERT...EXEC maps the proc's result set by position (RoleLabel, UserId, DisplayName, Email).
    INSERT INTO #Actual (RoleLabel, UserId, DisplayName, Email)
    EXEC dbo.usp_GetWorkspaceApproverTeams @WorkspaceId = @Ws;

    -- Assert
    EXEC tSQLt.AssertEqualsTable @Expected = '#Expected', @Actual = '#Actual';
END;
GO

CREATE PROCEDURE GetWorkspaceApproverTeamsTests.[test_ExcludesSoftDeletedAndOtherWorkspaces]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    DECLARE @Ws  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Ws2 UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000002';
    DECLARE @Live  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000A1';
    DECLARE @Gone  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000A2';
    DECLARE @Other UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000A3';

    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted)
    VALUES (@Live,  N'Live Member',  N'live@example.com',  0),
           (@Gone,  N'Gone Member',  N'gone@example.com',  0),
           (@Other, N'Other Member', N'other@example.com', 0);
    INSERT INTO dbo.ApproverTeamMembership (ApproverTeamMembershipId, WorkspaceId, RoleLabel, UserId, IsDeleted)
    VALUES (NEWID(), @Ws,  N'GCO', @Live,  0),   -- returned
           (NEWID(), @Ws,  N'GCO', @Gone,  1),   -- soft-deleted, excluded
           (NEWID(), @Ws2, N'GCO', @Other, 0);   -- other workspace, excluded

    CREATE TABLE #Actual (RoleLabel NVARCHAR(120), UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(256), Email NVARCHAR(256));

    -- Act
    INSERT INTO #Actual (RoleLabel, UserId, DisplayName, Email)
    EXEC dbo.usp_GetWorkspaceApproverTeams @WorkspaceId = @Ws;

    -- Assert — exactly the one live member of this workspace.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @IsLive INT = (SELECT COUNT(*) FROM #Actual WHERE UserId = @Live);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @IsLive;
END;
GO
