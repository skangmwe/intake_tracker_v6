-- =============================================
-- tSQLt tests for dbo.usp_AddApproverTeamMember (Slice 4 — Lifecycle & gates).
-- Covers: resolve-by-name add, no-match guard, ambiguous guard, and idempotent duplicate.
-- =============================================

EXEC tSQLt.NewTestClass 'AddApproverTeamMemberTests';
GO

CREATE PROCEDURE AddApproverTeamMemberTests.[test_ResolvesByDisplayNameAndAdds]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000AA';

    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted) VALUES (@U, N'Priya Raman', N'priya@example.com', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'WorkspaceAdmin', 0);

    -- Act
    EXEC dbo.usp_AddApproverTeamMember @WorkspaceId = @Ws, @RoleLabel = N'InfoSec', @Person = N'Priya Raman', @ActorUserId = N'test-actor';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.ApproverTeamMembership WHERE WorkspaceId = @Ws AND RoleLabel = N'InfoSec' AND UserId = @U AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE AddApproverTeamMemberTests.[test_ThrowsWhenNoMatch]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%No active member%';
    EXEC dbo.usp_AddApproverTeamMember @WorkspaceId = @Ws, @RoleLabel = N'InfoSec', @Person = N'Nobody Here', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE AddApproverTeamMemberTests.[test_ThrowsWhenAmbiguous]
AS
BEGIN
    -- Arrange: two workspace members share a display name.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U1 UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000A1';
    DECLARE @U2 UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000A2';

    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted)
    VALUES (@U1, N'Sam Lee', N'sam.lee.1@example.com', 0), (@U2, N'Sam Lee', N'sam.lee.2@example.com', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U1, N'Member', 0), (NEWID(), @Ws, @U2, N'Member', 0);

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%more than one%';
    EXEC dbo.usp_AddApproverTeamMember @WorkspaceId = @Ws, @RoleLabel = N'GCO', @Person = N'Sam Lee', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE AddApproverTeamMemberTests.[test_IdempotentDuplicateAdd]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000BB';

    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted) VALUES (@U, N'Dana Cole', N'dana@example.com', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Member', 0);

    -- Act — add the same person twice by email.
    EXEC dbo.usp_AddApproverTeamMember @WorkspaceId = @Ws, @RoleLabel = N'Data Privacy', @Person = N'dana@example.com', @ActorUserId = N'test-actor';
    EXEC dbo.usp_AddApproverTeamMember @WorkspaceId = @Ws, @RoleLabel = N'Data Privacy', @Person = N'dana@example.com', @ActorUserId = N'test-actor';

    -- Assert — still exactly one live membership.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.ApproverTeamMembership WHERE WorkspaceId = @Ws AND RoleLabel = N'Data Privacy' AND UserId = @U AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO
