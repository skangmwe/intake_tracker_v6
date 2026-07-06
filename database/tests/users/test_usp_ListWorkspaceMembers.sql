-- =============================================
-- tSQLt tests for dbo.usp_ListWorkspaceMembers (Slice 17 — Users & access).
-- Covers: projection of members with identity + level + disabled + last-active, exclusion of
-- soft-deleted memberships, isolation from other workspaces, and inclusion of disabled accounts.
-- =============================================

EXEC tSQLt.NewTestClass 'ListWorkspaceMembersTests';
GO

CREATE PROCEDURE ListWorkspaceMembersTests.[test_ReturnsMembersOfWorkspaceWithIdentityAndLevel]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U1 UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000A1';
    DECLARE @U2 UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000A2';

    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, LastSignInAt, IsDeleted)
    VALUES (@U1, N'Ada Byron', N'ada@example.com', 0, '2026-07-01T00:00:00', 0),
           (@U2, N'Bo Chen',   N'bo@example.com',  1, '2026-06-01T00:00:00', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U1, N'WorkspaceAdmin', 0),
           (NEWID(), @Ws, @U2, N'Member', 0);

    -- Act
    CREATE TABLE #Actual (UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(256), Email NVARCHAR(320),
                          [Level] NVARCHAR(32), IsDisabled BIT, LastActiveAt DATETIME2);
    INSERT INTO #Actual EXEC dbo.usp_ListWorkspaceMembers @WorkspaceId = @Ws;

    -- Assert — both members returned, disabled flag carried through (BS §6.8 admin must see them).
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = N'WorkspaceAdmin',
        @Actual = (SELECT [Level] FROM #Actual WHERE UserId = @U1);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT CAST(IsDisabled AS INT) FROM #Actual WHERE UserId = @U2);
END;
GO

CREATE PROCEDURE ListWorkspaceMembersTests.[test_ExcludesSoftDeletedMembershipsAndOtherWorkspaces]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws    UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Other UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000002';
    DECLARE @Live  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000B1';
    DECLARE @Gone  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000B2';
    DECLARE @Elsew UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000B3';

    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, LastSignInAt, IsDeleted)
    VALUES (@Live, N'Live One', N'live@example.com', 0, '2026-07-01T00:00:00', 0),
           (@Gone, N'Removed One', N'gone@example.com', 0, '2026-07-01T00:00:00', 0),
           (@Elsew, N'Other Ws', N'other@example.com', 0, '2026-07-01T00:00:00', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @Live, N'Member', 0),
           (NEWID(), @Ws, @Gone, N'Member', 1),          -- soft-deleted → excluded
           (NEWID(), @Other, @Elsew, N'Member', 0);      -- other workspace → excluded

    -- Act
    CREATE TABLE #Actual (UserId UNIQUEIDENTIFIER, DisplayName NVARCHAR(256), Email NVARCHAR(320),
                          [Level] NVARCHAR(32), IsDisabled BIT, LastActiveAt DATETIME2);
    INSERT INTO #Actual EXEC dbo.usp_ListWorkspaceMembers @WorkspaceId = @Ws;

    -- Assert — only the one live member of this workspace.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = @Live, @Actual = (SELECT TOP (1) UserId FROM #Actual);
END;
GO
