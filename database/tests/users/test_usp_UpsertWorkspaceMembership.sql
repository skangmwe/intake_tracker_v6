-- =============================================
-- tSQLt tests for dbo.usp_UpsertWorkspaceMembership (Slice 17 — Users & access).
-- Covers: add-by-email resolution, add-by-userId, level change on an existing member,
-- reactivation of a soft-deleted membership, no-match / ambiguous guards, and idempotency.
-- =============================================

EXEC tSQLt.NewTestClass 'UpsertWorkspaceMembershipTests';
GO

CREATE PROCEDURE UpsertWorkspaceMembershipTests.[test_ResolvesEmailAndAddsMember]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000AA';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted) VALUES (@U, N'Priya Raman', N'priya@example.com', 0);

    -- Act
    EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId = @Ws, @Email = N'priya@example.com', @Level = N'Member', @ActorUserId = N'test-actor';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND [Level] = N'Member' AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE UpsertWorkspaceMembershipTests.[test_AddsByUserIdWhenSupplied]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000AB';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted) VALUES (@U, N'Known Id', N'known@example.com', 0);

    -- Act — no email; the id path is used directly.
    EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId = @Ws, @TargetUserId = @U, @Level = N'Viewer', @ActorUserId = N'test-actor';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND [Level] = N'Viewer' AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE UpsertWorkspaceMembershipTests.[test_ChangesLevelOfExistingMember]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000AC';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted) VALUES (@U, N'Level Up', N'levelup@example.com', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Viewer', 0);

    -- Act
    EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId = @Ws, @TargetUserId = @U, @Level = N'WorkspaceAdmin', @ActorUserId = N'test-actor';

    -- Assert — still one row, now at the new level.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = N'WorkspaceAdmin',
        @Actual = (SELECT [Level] FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE UpsertWorkspaceMembershipTests.[test_ReactivatesSoftDeletedMembership]
AS
BEGIN
    -- Arrange — a previously deactivated membership.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000AD';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted) VALUES (@U, N'Back Again', N'back@example.com', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted, DeletedAt)
    VALUES (NEWID(), @Ws, @U, N'Member', 1, SYSUTCDATETIME());

    -- Act
    EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId = @Ws, @TargetUserId = @U, @Level = N'Member', @ActorUserId = N'test-actor';

    -- Assert — the same row reactivated; exactly one live membership, no duplicate insert.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT CAST(IsDeleted AS INT) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U);
END;
GO

CREATE PROCEDURE UpsertWorkspaceMembershipTests.[test_ThrowsWhenEmailUnresolved]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%No active user%';
    EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId = @Ws, @Email = N'nobody@example.com', @Level = N'Member', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE UpsertWorkspaceMembershipTests.[test_ThrowsWhenEmailAmbiguous]
AS
BEGIN
    -- Arrange — two active users share a display name; resolving by that name is ambiguous.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U1 UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000E1';
    DECLARE @U2 UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000E2';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted)
    VALUES (@U1, N'Sam Lee', N'sam.1@example.com', 0), (@U2, N'Sam Lee', N'sam.2@example.com', 0);

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%More than one user%';
    EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId = @Ws, @Email = N'Sam Lee', @Level = N'Member', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE UpsertWorkspaceMembershipTests.[test_IdempotentRepeatUpsert]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000AF';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDeleted) VALUES (@U, N'Dana Cole', N'dana@example.com', 0);

    -- Act — add the same person twice.
    EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId = @Ws, @Email = N'dana@example.com', @Level = N'Member', @ActorUserId = N'test-actor';
    EXEC dbo.usp_UpsertWorkspaceMembership @WorkspaceId = @Ws, @Email = N'dana@example.com', @Level = N'Member', @ActorUserId = N'test-actor';

    -- Assert — still exactly one live membership.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND IsDeleted = 0);
END;
GO
