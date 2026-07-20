-- =============================================
-- tSQLt tests for dbo.usp_SetMemberSuspension (S29 — Suspend / Reactivate). Covers: suspend disables
-- the account while KEEPING the membership (Status → Suspended), reactivate re-enables it, the
-- pending named-individual-signoff block on suspend (409 path), that reactivate is NOT blocked by a
-- pending sign-off, and the no-op when the target is not a member of the workspace.
-- =============================================

EXEC tSQLt.NewTestClass 'SetMemberSuspensionTests';
GO

CREATE PROCEDURE SetMemberSuspensionTests.[test_SuspendDisablesButKeepsMembership]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000D1';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Member', N'member@example.com', 0, 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Member', 0);

    -- Act
    EXEC dbo.usp_SetMemberSuspension @WorkspaceId = @Ws, @TargetUserId = @U, @Suspended = 1, @ActorUserId = N'test-actor';

    -- Assert — account disabled firm-wide, membership STILL live (unlike deactivate).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT CAST(IsDisabled AS INT) FROM dbo.Users WHERE UserId = @U);
    EXEC tSQLt.AssertEquals @Expected = 1,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE SetMemberSuspensionTests.[test_ReactivateEnablesAccount]
AS
BEGIN
    -- Arrange — a suspended member (IsDisabled = 1, membership live).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000D2';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Suspended', N'suspended@example.com', 1, 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Member', 0);

    -- Act
    EXEC dbo.usp_SetMemberSuspension @WorkspaceId = @Ws, @TargetUserId = @U, @Suspended = 0, @ActorUserId = N'test-actor';

    -- Assert — re-enabled, still a member.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT CAST(IsDisabled AS INT) FROM dbo.Users WHERE UserId = @U);
    EXEC tSQLt.AssertEquals @Expected = 1,
        @Actual = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @Ws AND UserId = @U AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE SetMemberSuspensionTests.[test_BlocksSuspendWhenPendingNamedIndividualSignoff]
AS
BEGIN
    -- Arrange — an unresolved gate whose frozen slot names this user individually.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000D3';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Signer', N'signer2@example.com', 0, 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Member', 0);
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, WorkspaceId, [State], FrozenApproverSet, IsDeleted)
    VALUES (NEWID(), @Ws, N'Pending',
            N'[{"slotIndex":0,"namedUserId":"00000000-0000-4000-8000-0000000000D3"}]', 0);

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%pending individual sign-off%';
    EXEC dbo.usp_SetMemberSuspension @WorkspaceId = @Ws, @TargetUserId = @U, @Suspended = 1, @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE SetMemberSuspensionTests.[test_ReactivateNotBlockedByPendingSignoff]
AS
BEGIN
    -- Arrange — same pending named-individual gate, but we are REACTIVATING (no floor on reactivate).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000D4';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Signer', N'signer3@example.com', 1, 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], IsDeleted)
    VALUES (NEWID(), @Ws, @U, N'Member', 0);
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, WorkspaceId, [State], FrozenApproverSet, IsDeleted)
    VALUES (NEWID(), @Ws, N'Pending',
            N'[{"slotIndex":0,"namedUserId":"00000000-0000-4000-8000-0000000000D4"}]', 0);

    -- Act — reactivation must succeed despite the pending gate.
    EXEC dbo.usp_SetMemberSuspension @WorkspaceId = @Ws, @TargetUserId = @U, @Suspended = 0, @ActorUserId = N'test-actor';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT CAST(IsDisabled AS INT) FROM dbo.Users WHERE UserId = @U);
END;
GO

CREATE PROCEDURE SetMemberSuspensionTests.[test_NoMembershipIsNoop]
AS
BEGIN
    -- Arrange — the user exists but is NOT a member of this workspace.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U  UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000D5';
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted) VALUES (@U, N'Outsider', N'outsider@example.com', 0, 0);

    -- Act — no membership in @Ws, so the flag must not change.
    EXEC dbo.usp_SetMemberSuspension @WorkspaceId = @Ws, @TargetUserId = @U, @Suspended = 1, @ActorUserId = N'test-actor';

    -- Assert — still enabled (a WorkspaceAdmin of one workspace cannot disable a non-member).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT CAST(IsDisabled AS INT) FROM dbo.Users WHERE UserId = @U);
END;
GO
