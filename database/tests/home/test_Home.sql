-- =============================================
-- tSQLt tests for the Home surface procs (Slice 22 — S1, BS §10.7). One class per proc concern:
--   • usp_GetHomeDecisions  — caller-eligible unsigned gates; excludes signed / not-eligible / resolved.
--   • usp_GetHomeWork       — records the caller owns (CreatedBy), open only, urgency-ordered, labelled.
--   • usp_GetHomeActivity   — record activity since the caller's prior visit; stamps LastHomeSeenAt;
--                             first-visit fallback; excludes config events.
--   • usp_GetHomeTriage     — unassigned open records only.
--   • usp_GetHomePinnedAnnouncements — pinned/published/in-audience/member only.
-- FakeTable turns persisted computed columns (AssignedAnalyst, DueDate, DeptPgClient) into settable
-- columns. database-testing.md (AAA, FakeTable, at least one assertion per test).
-- =============================================

EXEC tSQLt.NewTestClass 'HomeTests';
GO

-- Shared identifiers.
--   Caller  = ...00aa   Other = ...00bb   Workspace = 1A15...0001   Lifecycle = 2222...
CREATE PROCEDURE HomeTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalDecisions';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Announcements';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, DueSoonWindowDays, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'AI Solutions', N'ai-solutions', N'AIS', 3, 0);
END;
GO

-- ─── usp_GetHomeDecisions ────────────────────────────────────────────────────

CREATE PROCEDURE HomeTests.[test_Decisions_ReturnsEligibleUnsignedGate]
AS
BEGIN
    -- Arrange — one pending gate; the caller is an eligible slot member; no one has approved.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Clause extraction', 0, N's', N's');

    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId,
        GateName, FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State, OpenedAt,
        FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', NEWID(),
        N'QA readiness', N'build', N'qa', N'Build', N'QA', N'Pending', '2026-07-01T10:00:00',
        N'[{"slotIndex":0,"roleLabel":"AI Solutions Manager","displayLabel":"AI Solutions Manager","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000aa","displayName":"Ada"}]}]',
        0, N's', N's');

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), GateLabel NVARCHAR(400), RoleLabel NVARCHAR(120), OpenedAt DATETIME2, TotalCount INT);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomeDecisions @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — one row, gate label and role label composed.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'Build → QA', @Actual = (SELECT TOP 1 GateLabel FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AI Solutions Manager', @Actual = (SELECT TOP 1 RoleLabel FROM #Rows);
END;
GO

CREATE PROCEDURE HomeTests.[test_Decisions_ExcludesAlreadyApprovedSlot]
AS
BEGIN
    -- Arrange — the caller's only slot has a live Approved decision, so the gate no longer needs them.
    DECLARE @Ar UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Clause extraction', 0, N's', N's');
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId,
        GateName, FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State, OpenedAt,
        FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Ar, N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', NEWID(),
        N'QA readiness', N'build', N'qa', N'Build', N'QA', N'Pending', '2026-07-01T10:00:00',
        N'[{"slotIndex":0,"roleLabel":"AI Solutions Manager","displayLabel":"AI Solutions Manager","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000aa","displayName":"Ada"}]}]',
        0, N's', N's');
    INSERT INTO dbo.ApprovalDecisions (DecisionId, ApprovalRequestId, SlotIndex, Decision, DecidedByUserId, DecidedAt, SupersededAt, IsProxy, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Ar, 0, N'Approved', '00000000-0000-4000-8000-0000000000aa', '2026-07-02T10:00:00', NULL, 0, 0, N's', N's');

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), GateLabel NVARCHAR(400), RoleLabel NVARCHAR(120), OpenedAt DATETIME2, TotalCount INT);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomeDecisions @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — nothing needs the caller.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #Rows);
END;
GO

CREATE PROCEDURE HomeTests.[test_Decisions_ExcludesNotEligibleAndResolved]
AS
BEGIN
    -- Arrange — one gate the caller is NOT eligible for, and one Resolved gate the caller IS in.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'A', 0, N's', N's'),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', N'B', 0, N's', N's');
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId,
        GateName, FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State, OpenedAt,
        FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', NEWID(),
            N'QA', N'build', N'qa', N'Build', N'QA', N'Pending', '2026-07-01T10:00:00',
            N'[{"slotIndex":0,"roleLabel":"GCO","displayLabel":"GCO","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000bb","displayName":"Ben"}]}]',
            0, N's', N's'),
        (NEWID(), N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', NEWID(),
            N'Deploy', N'qa', N'deploy', N'QA', N'Deploy', N'Resolved', '2026-07-01T11:00:00',
            N'[{"slotIndex":0,"roleLabel":"AI Solutions Manager","displayLabel":"AI Solutions Manager","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000aa","displayName":"Ada"}]}]',
            0, N's', N's');

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), GateLabel NVARCHAR(400), RoleLabel NVARCHAR(120), OpenedAt DATETIME2, TotalCount INT);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomeDecisions @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — neither surfaces.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #Rows);
END;
GO

-- ─── usp_GetHomeWork ─────────────────────────────────────────────────────────

CREATE PROCEDURE HomeTests.[test_Work_ReturnsOwnedOpenExcludesOthersAndClosed]
AS
BEGIN
    -- Arrange — caller owns one open + one closed; another user owns a third.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, DeptPgClient, Origin, AssignedAnalyst, DueDate, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Mine open', N'build', N'Finance', N'AI Solutions', N'Ada', '2026-07-20', N'{}', 0, N'00000000-0000-4000-8000-0000000000aa', N's'),
        (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Mine closed', N'post-launch', N'Finance', N'AI Solutions', N'Ada', '2026-07-20', N'{"outcome":"Live"}', 0, N'00000000-0000-4000-8000-0000000000aa', N's'),
        (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Not mine', N'build', N'Finance', N'AI Solutions', N'Ben', '2026-07-20', N'{}', 0, N'00000000-0000-4000-8000-0000000000bb', N's');

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), StageLabel NVARCHAR(120), Origin NVARCHAR(200), DueDate DATE, DueSoonWindowDays INT, TotalCount INT);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomeWork @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — only the caller's OPEN record; DeptPgClient drives Origin; window carried through.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = (SELECT TOP 1 RecordId FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'Finance', @Actual = (SELECT TOP 1 Origin FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = (SELECT TOP 1 DueSoonWindowDays FROM #Rows);
END;
GO

CREATE PROCEDURE HomeTests.[test_Work_UrgencyOrderAndStageLabel]
AS
BEGIN
    -- Arrange — overdue, due-soon (window 3), far-dated, undated (relative to the real clock).
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '22222222-2222-4222-8222-222222222222', '1A150000-0000-4000-8000-000000000001', N'build', N'Build phase', N'Build', 3, 0, N's', N's');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, DeptPgClient, AssignedAnalyst, DueDate, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (N'AIS-00000010', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Far',      N'build', N'X', N'Ada', CAST(DATEADD(DAY, 30, SYSUTCDATETIME()) AS DATE), N'{}', 0, N'00000000-0000-4000-8000-0000000000aa', N's'),
        (N'AIS-00000011', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'None',     N'build', N'X', N'Ada', NULL,                                            N'{}', 0, N'00000000-0000-4000-8000-0000000000aa', N's'),
        (N'AIS-00000012', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Overdue',  N'build', N'X', N'Ada', CAST(DATEADD(DAY, -5, SYSUTCDATETIME()) AS DATE), N'{}', 0, N'00000000-0000-4000-8000-0000000000aa', N's'),
        (N'AIS-00000013', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'DueSoon',  N'build', N'X', N'Ada', CAST(DATEADD(DAY, 1, SYSUTCDATETIME()) AS DATE),  N'{}', 0, N'00000000-0000-4000-8000-0000000000aa', N's');

    -- Act — Seq (identity) preserves the proc's ORDER BY into the temp table.
    CREATE TABLE #Rows (Seq INT IDENTITY(1,1), RecordId NVARCHAR(20), Name NVARCHAR(400), StageLabel NVARCHAR(120), Origin NVARCHAR(200), DueDate DATE, DueSoonWindowDays INT, TotalCount INT);
    INSERT INTO #Rows (RecordId, Name, StageLabel, Origin, DueDate, DueSoonWindowDays, TotalCount)
    EXEC dbo.usp_GetHomeWork @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — order: Overdue, DueSoon, Far, None; stage label resolves from the lifecycle.
    EXEC tSQLt.AssertEquals @Expected = N'Overdue', @Actual = (SELECT Name FROM #Rows WHERE Seq = 1);
    EXEC tSQLt.AssertEquals @Expected = N'DueSoon', @Actual = (SELECT Name FROM #Rows WHERE Seq = 2);
    EXEC tSQLt.AssertEquals @Expected = N'Far',     @Actual = (SELECT Name FROM #Rows WHERE Seq = 3);
    EXEC tSQLt.AssertEquals @Expected = N'None',    @Actual = (SELECT Name FROM #Rows WHERE Seq = 4);
    EXEC tSQLt.AssertEquals @Expected = N'Build phase', @Actual = (SELECT StageLabel FROM #Rows WHERE Seq = 1);
END;
GO

-- ─── usp_GetHomeActivity ─────────────────────────────────────────────────────

CREATE PROCEDURE HomeTests.[test_Activity_SincePrevVisitAndStampsNow]
AS
BEGIN
    -- Arrange — caller last saw Home on 2026-07-02; an event before and after it, plus a config event.
    INSERT INTO dbo.Users (UserId, DisplayName, Email, LastHomeSeenAt, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ada', N'ada@x.com', '2026-07-02T00:00:00', 0, 0),
           ('00000000-0000-4000-8000-0000000000bb', N'Ben', N'ben@x.com', NULL, 0, 0);
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Deposition summarizer', 0, N's', N's');
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES
        (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'gate.decided',  '00000000-0000-4000-8000-0000000000bb', '2026-07-03T10:00:00', N'{}', N's', N's', 0),
        (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.created','00000000-0000-4000-8000-0000000000bb', '2026-07-01T10:00:00', N'{}', N's', N's', 0),
        (NEWID(), '1A150000-0000-4000-8000-000000000001', NULL,           NULL,       N'config.role.added','00000000-0000-4000-8000-0000000000bb', '2026-07-03T11:00:00', N'{}', N's', N's', 0);

    -- Act
    DECLARE @Since DATETIME2;
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomeActivity @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @SinceLastSeenAt = @Since OUTPUT;

    -- Assert — only the record event after the prior visit; actor name resolved; OUTPUT = prior visit;
    --          LastHomeSeenAt advanced to ~now.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'gate.decided', @Actual = (SELECT TOP 1 EventType FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'Ben', @Actual = (SELECT TOP 1 ActorName FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = '2026-07-02T00:00:00', @Actual = @Since;

    DECLARE @Advanced INT = (SELECT COUNT(*) FROM dbo.Users WHERE UserId = '00000000-0000-4000-8000-0000000000aa' AND LastHomeSeenAt > '2026-07-02T00:00:00');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Advanced;
END;
GO

CREATE PROCEDURE HomeTests.[test_Activity_FirstVisitReturnsNullSince]
AS
BEGIN
    -- Arrange — a brand-new user (LastHomeSeenAt NULL); a recent record event within the fallback window.
    INSERT INTO dbo.Users (UserId, DisplayName, Email, LastHomeSeenAt, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ada', N'ada@x.com', NULL, 0, 0);
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'R', 0, N's', N's');
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.created', NULL, DATEADD(DAY, -1, SYSUTCDATETIME()), N'{}', N's', N's', 0);

    -- Act
    DECLARE @Since DATETIME2 = '2026-01-01';  -- pre-set to prove it is overwritten with NULL
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomeActivity @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @SinceLastSeenAt = @Since OUTPUT;

    -- Assert — the recent event is inside the 7-day fallback; the OUTPUT is NULL (first visit).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @Since;
END;
GO

-- ─── usp_GetHomeTriage ───────────────────────────────────────────────────────

CREATE PROCEDURE HomeTests.[test_Triage_ReturnsUnassignedOpenOnly]
AS
BEGIN
    -- Arrange — unassigned+open (in), assigned (out), unassigned+closed (out).
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Origin, DeptPgClient, AssignedAnalyst, FieldValues, CreatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Unassigned', N'Escalated · Tax', N'Tax', NULL,    N'{}', '2026-07-06T10:00:00', 0, N's', N's'),
        (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Assigned',   N'Direct intake', N'Ops', N'Ada', N'{}', '2026-07-06T09:00:00', 0, N's', N's'),
        (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Closed',     N'Direct intake', N'Ops', NULL,    N'{"outcome":"Withdrawn"}', '2026-07-06T08:00:00', 0, N's', N's');

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Origin NVARCHAR(200), ReceivedAt DATETIME2, TotalCount INT);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomeTriage @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — only the unassigned open record, origin from the system Origin column.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = (SELECT TOP 1 RecordId FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'Escalated · Tax', @Actual = (SELECT TOP 1 Origin FROM #Rows);
END;
GO

-- ─── usp_GetHomePinnedAnnouncements ──────────────────────────────────────────

CREATE PROCEDURE HomeTests.[test_Pinned_ReturnsPinnedPublishedInAudienceForMember]
AS
BEGIN
    -- Arrange — member; one pinned+published (in), one not pinned (out), one draft (out).
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, Level, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0, N's', N's');
    INSERT INTO dbo.Announcements (AnnouncementId, WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, ExpiresOn, Status, PublishedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', N'Pinned notice',   N'Body one', N'{"kind":"everyone"}', 1, NULL, N'Published', '2026-07-05T10:00:00', 0, N's', N's'),
        (NEWID(), '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', N'Unpinned notice', N'Body two', N'{"kind":"everyone"}', 0, NULL, N'Published', '2026-07-05T09:00:00', 0, N's', N's'),
        (NEWID(), '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', N'Draft notice',    N'Body three', N'{"kind":"everyone"}', 1, NULL, N'Draft', NULL, 0, N's', N's');

    -- Act
    CREATE TABLE #Rows (AnnouncementId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280), PublishedAt DATETIME2);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomePinnedAnnouncements @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — only the pinned, published one.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'Pinned notice', @Actual = (SELECT TOP 1 Title FROM #Rows);
END;
GO

CREATE PROCEDURE HomeTests.[test_Pinned_ExcludesWhenNotMember]
AS
BEGIN
    -- Arrange — a pinned/published everyone announcement but the caller is NOT a workspace member.
    INSERT INTO dbo.Announcements (AnnouncementId, WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, ExpiresOn, Status, PublishedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000bb', N'Pinned notice', N'Body', N'{"kind":"everyone"}', 1, NULL, N'Published', '2026-07-05T10:00:00', 0, N's', N's');

    -- Act
    CREATE TABLE #Rows (AnnouncementId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280), PublishedAt DATETIME2);
    INSERT INTO #Rows
    EXEC dbo.usp_GetHomePinnedAnnouncements @UserId = '00000000-0000-4000-8000-0000000000aa', @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — a non-member sees nothing (audience never widens access).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #Rows);
END;
GO
