-- =============================================
-- Author:      Workspace provisioning redesign
-- Description: Unit tests for usp_ListWorkspacesForPlatform (rich workspaces list).
-- =============================================
EXEC tSQLt.NewTestClass 'test_usp_ListWorkspacesForPlatform';
GO
CREATE OR ALTER PROCEDURE test_usp_ListWorkspacesForPlatform.[test excludes the pg-dept-template row]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.Workspaces';
    EXEC tSQLt.FakeTable 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable 'dbo.Users';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, CreatedAt, RetiredAt, IsDeleted)
    VALUES ('11111111-1111-4111-8111-111111111111', N'Litigation', N'pg-dept', N'LIT', '2026-07-01', NULL, 0),
           ('22222222-2222-4222-8222-222222222222', N'PG / Department Template', N'pg-dept-template', N'TMPL', '2026-01-01', NULL, 0);

    CREATE TABLE #expected (WorkspaceId UNIQUEIDENTIFIER);
    INSERT INTO #expected VALUES ('11111111-1111-4111-8111-111111111111');

    CREATE TABLE #captured (WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200), Kind NVARCHAR(32), Prefix NVARCHAR(16),
        OwnerDisplayName NVARCHAR(256), MemberCount INT, ProvisionedAt DATETIME2, IsArchived BIT);
    INSERT INTO #captured EXEC dbo.usp_ListWorkspacesForPlatform;

    SELECT WorkspaceId INTO #actualIds FROM #captured;
    EXEC tSQLt.AssertEqualsTable '#expected', '#actualIds';
END;
GO
CREATE OR ALTER PROCEDURE test_usp_ListWorkspacesForPlatform.[test owner is the earliest workspace admin and member count is active only]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.Workspaces';
    EXEC tSQLt.FakeTable 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable 'dbo.Users';

    DECLARE @ws UNIQUEIDENTIFIER = '11111111-1111-4111-8111-111111111111';
    DECLARE @early UNIQUEIDENTIFIER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    DECLARE @late  UNIQUEIDENTIFIER = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, CreatedAt, RetiredAt, IsDeleted)
    VALUES (@ws, N'Litigation', N'pg-dept', N'LIT', '2026-07-01', NULL, 0);
    INSERT INTO dbo.Users (UserId, DisplayName, IsDeleted)
    VALUES (@early, N'Grace Lin', 0), (@late, N'Late Admin', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, Level, CreatedAt, IsDeleted)
    VALUES (NEWID(), @ws, @late,  N'WorkspaceAdmin', '2026-07-05', 0),
           (NEWID(), @ws, @early, N'WorkspaceAdmin', '2026-07-02', 0),
           (NEWID(), @ws, NEWID(), N'Member',        '2026-07-03', 0),
           (NEWID(), @ws, NEWID(), N'Viewer',        '2026-07-04', 1); -- deleted → not counted

    CREATE TABLE #captured (WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200), Kind NVARCHAR(32), Prefix NVARCHAR(16),
        OwnerDisplayName NVARCHAR(256), MemberCount INT, ProvisionedAt DATETIME2, IsArchived BIT);
    INSERT INTO #captured EXEC dbo.usp_ListWorkspacesForPlatform;

    DECLARE @owner NVARCHAR(256) = (SELECT OwnerDisplayName FROM #captured WHERE WorkspaceId = @ws);
    DECLARE @count INT = (SELECT MemberCount FROM #captured WHERE WorkspaceId = @ws);
    EXEC tSQLt.AssertEqualsString 'Grace Lin', @owner;
    EXEC tSQLt.AssertEquals 3, @count; -- late admin + early admin + member; deleted viewer excluded
END;
GO
CREATE OR ALTER PROCEDURE test_usp_ListWorkspacesForPlatform.[test archived flag and null owner when no admin]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.Workspaces';
    EXEC tSQLt.FakeTable 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable 'dbo.Users';

    DECLARE @ws UNIQUEIDENTIFIER = '33333333-3333-4333-8333-333333333333';
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, CreatedAt, RetiredAt, IsDeleted)
    VALUES (@ws, N'Tax', N'pg-dept', N'TAX', '2026-05-14', '2026-06-01', 0);

    CREATE TABLE #captured (WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200), Kind NVARCHAR(32), Prefix NVARCHAR(16),
        OwnerDisplayName NVARCHAR(256), MemberCount INT, ProvisionedAt DATETIME2, IsArchived BIT);
    INSERT INTO #captured EXEC dbo.usp_ListWorkspacesForPlatform;

    DECLARE @isArchived BIT = (SELECT IsArchived FROM #captured WHERE WorkspaceId = @ws);
    DECLARE @owner NVARCHAR(256) = (SELECT OwnerDisplayName FROM #captured WHERE WorkspaceId = @ws);
    DECLARE @count INT = (SELECT MemberCount FROM #captured WHERE WorkspaceId = @ws);
    EXEC tSQLt.AssertEquals 1, @isArchived;
    EXEC tSQLt.AssertEquals 0, @count;
    IF @owner IS NOT NULL EXEC tSQLt.Fail 'OwnerDisplayName should be NULL when no WorkspaceAdmin exists';
END;
GO
