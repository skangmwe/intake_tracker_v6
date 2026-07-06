-- =============================================
-- tSQLt tests for dbo.usp_DeactivateMember (Slice 17 — Users & access, BS §6.8 safety floor).
-- Covers: disable + membership-removal on success, the pending named-individual-signoff block
-- (409 path), that a team-slot sign-off does NOT block, and idempotent re-deactivation.
-- =============================================

EXEC tSQLt.NewTestClass 'DeactivateMemberTests';
GO

CREATE PROCEDURE DeactivateMemberTests.[test_DisablesAccountAndRemovesMembership]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000C1';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Leaver', N'leaver@example.com', 0, 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Member', 0);

    -- Act
    EXEC dbo.usp_DeactivateMember @WorkspaceId = @Ws, @TargetUserId = @U, @ActorUserId = N'test-actor';

    -- Assert — account disabled firm-wide, membership soft-deleted.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT CAST(IsDisabled AS INT) FROM dbo.Users WHERE UserId = @U);
    EXEC tSQLt.AssertEquals @Expected = 0,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE DeactivateMemberTests.[test_BlocksWhenPendingNamedIndividualSignoff]
AS
BEGIN
    -- Arrange — an unresolved gate whose frozen slot names this user individually.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000C2';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Signer', N'signer@example.com', 0, 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Member', 0);
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, WorkspaceId, [State], FrozenApproverSet, IsDeleted)
    VALUES (NEWID(), @Ws, N'Pending',
            N'[{"slotIndex":0,"namedUserId":"00000000-0000-4000-8000-0000000000C2"}]', 0);

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%pending individual sign-off%';
    EXEC dbo.usp_DeactivateMember @WorkspaceId = @Ws, @TargetUserId = @U, @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE DeactivateMemberTests.[test_TeamSlotSignoffDoesNotBlock]
AS
BEGIN
    -- Arrange — an unresolved gate where the user is only a team-slot eligible member
    -- (no namedUserId marker). Per api-contracts §2, team-slot sign-offs do not block.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000C3';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Eligible', N'eligible@example.com', 0, 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Member', 0);
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, WorkspaceId, [State], FrozenApproverSet, IsDeleted)
    VALUES (NEWID(), @Ws, N'Pending',
            N'[{"slotIndex":0,"roleLabel":"InfoSec","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000C3","displayName":"Eligible"}]}]', 0);

    -- Act — must succeed despite the pending team gate.
    EXEC dbo.usp_DeactivateMember @WorkspaceId = @Ws, @TargetUserId = @U, @ActorUserId = N'test-actor';

    -- Assert — deactivation went through.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT CAST(IsDisabled AS INT) FROM dbo.Users WHERE UserId = @U);
END;
GO

CREATE PROCEDURE DeactivateMemberTests.[test_IdempotentReDeactivate]
AS
BEGIN
    -- Arrange — already disabled + membership already soft-deleted.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000C4';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Gone', N'gone@example.com', 1, 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted, DeletedAt)
    VALUES (NEWID(), @Ws, @U, N'Member', 1, SYSUTCDATETIME());

    -- Act — a second deactivate is a no-op that still succeeds.
    EXEC dbo.usp_DeactivateMember @WorkspaceId = @Ws, @TargetUserId = @U, @ActorUserId = N'test-actor';

    -- Assert — still disabled, still no live membership.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT CAST(IsDisabled AS INT) FROM dbo.Users WHERE UserId = @U);
    EXEC tSQLt.AssertEquals @Expected = 0,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND IsDeleted = 0);
END;
GO
