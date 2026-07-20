-- =============================================
-- tSQLt tests for dbo.usp_CancelInvitation (Invited membership state — S29).
-- Covers: a live invite is soft-cancelled and reports Cancelled = 1; a wrong-workspace id, an
-- already-accepted invite, and a missing id all change nothing and report Cancelled = 0 (the service
-- maps a 0 to 403 — never disclose existence). database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'CancelInvitationTests';
GO

CREATE PROCEDURE CancelInvitationTests.[test_CancelsLiveInvitationAndReportsCancelled]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceInvitation';
    DECLARE @Ws  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Inv UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000F1';
    INSERT INTO dbo.WorkspaceInvitation (InvitationId, WorkspaceId, Email, [Level], [Status], IsDeleted)
    VALUES (@Inv, @Ws, N'invitee@example.com', N'Member', N'Invited', 0);

    -- Act
    CREATE TABLE #Result (Cancelled BIT);
    INSERT INTO #Result EXEC dbo.usp_CancelInvitation @WorkspaceId = @Ws, @InvitationId = @Inv, @ActorUserId = N'test-actor';

    -- Assert — reported cancelled, and the row is now Status 'Cancelled' (retained, not hard-deleted).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT Cancelled FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = N'Cancelled',
        @Actual = (SELECT [Status] FROM dbo.WorkspaceInvitation WHERE InvitationId = @Inv);
END;
GO

CREATE PROCEDURE CancelInvitationTests.[test_ReportsNotCancelledForWrongWorkspace]
AS
BEGIN
    -- Arrange — a live invite, but the caller names a different workspace.
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceInvitation';
    DECLARE @Ws    UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Other UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000002';
    DECLARE @Inv   UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000F2';
    INSERT INTO dbo.WorkspaceInvitation (InvitationId, WorkspaceId, Email, [Level], [Status], IsDeleted)
    VALUES (@Inv, @Ws, N'invitee@example.com', N'Member', N'Invited', 0);

    -- Act
    CREATE TABLE #Result (Cancelled BIT);
    INSERT INTO #Result EXEC dbo.usp_CancelInvitation @WorkspaceId = @Other, @InvitationId = @Inv, @ActorUserId = N'test-actor';

    -- Assert — nothing cancelled; the invite is untouched.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT Cancelled FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = N'Invited',
        @Actual = (SELECT [Status] FROM dbo.WorkspaceInvitation WHERE InvitationId = @Inv);
END;
GO

CREATE PROCEDURE CancelInvitationTests.[test_ReportsNotCancelledForAlreadyAcceptedInvite]
AS
BEGIN
    -- Arrange — an invite that has already been accepted is not a live invite.
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceInvitation';
    DECLARE @Ws  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Inv UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000F3';
    INSERT INTO dbo.WorkspaceInvitation (InvitationId, WorkspaceId, Email, [Level], [Status], IsDeleted)
    VALUES (@Inv, @Ws, N'accepted@example.com', N'Member', N'Accepted', 0);

    -- Act
    CREATE TABLE #Result (Cancelled BIT);
    INSERT INTO #Result EXEC dbo.usp_CancelInvitation @WorkspaceId = @Ws, @InvitationId = @Inv, @ActorUserId = N'test-actor';

    -- Assert — nothing cancelled; the accepted invite stays Accepted.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT Cancelled FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = N'Accepted',
        @Actual = (SELECT [Status] FROM dbo.WorkspaceInvitation WHERE InvitationId = @Inv);
END;
GO

CREATE PROCEDURE CancelInvitationTests.[test_ReportsNotCancelledForMissingInvite]
AS
BEGIN
    -- Arrange — no invitation with the requested id exists.
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceInvitation';
    DECLARE @Ws  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Inv UNIQUEIDENTIFIER = '00000000-0000-4000-8000-0000000000F4';

    -- Act
    CREATE TABLE #Result (Cancelled BIT);
    INSERT INTO #Result EXEC dbo.usp_CancelInvitation @WorkspaceId = @Ws, @InvitationId = @Inv, @ActorUserId = N'test-actor';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT Cancelled FROM #Result);
END;
GO
