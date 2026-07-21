-- =============================================
-- tSQLt tests for the Gates / Approvals procs (Slice 8).
-- Covers: gate-for-transition detection (gated edge vs ungated), open-gate (freeze slots + eligible
--         members, gate-already-open THROW, access gate), submit-decision (single-slot approve
--         resolves + advances the record, AND-join across two slots, reject sets ChangesRequested
--         and does NOT advance, rejection-requires-comment, ineligible signer, unknown slot, proxy
--         bypass, access gate), and re-request (returns a rejected slot to pending, retains history).
-- database-testing.md (AAA, FakeTable). GUIDs / names are synthetic; no real PII.
-- =============================================

EXEC tSQLt.NewTestClass 'GatesTests';
GO

-- Shared synthetic identifiers (kept identical across tests for readability).
--   Ws      = 1A150000-0000-4000-8000-000000000001
--   Lifecycle = 11111111-1111-4111-8111-111111111111
--   Record  = AIS-00000001
--   Caller (a workspace member)  = 00000000-0000-4000-8000-0000000000aa
--   Signer Casey (GCO team)      = 00000000-0000-4000-8000-0000000000cc
--   Signer Dana  (InfoSec team)  = 00000000-0000-4000-8000-0000000000dd
--   Gate    = 6A7E0000-0000-4000-8000-000000000001
--   AR      = 7A000000-0000-4000-8000-000000000001

-- ── Gate-for-transition ─────────────────────────────────────────────────────────

CREATE PROCEDURE GatesTests.[test_GetGateForTransitionReturnsGateOnGatedEdge]
AS
BEGIN
    -- Arrange — record at 'execution'; a gate guards execution → validation.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', N'R', N'execution', N'{}', 0, N's', N's');
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('57A60000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'execution', N'Execution', N'Execution', 2, 0, N's', N's'),
           ('57A60000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'validation', N'Validation', N'Validation', 3, 0, N's', N's');
    INSERT INTO dbo.GateDefinition (GateDefinitionId, LifecycleId, WorkspaceId, Name, FromStageId, ToStageId, JoinKind, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('6A7E0000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'QA readiness gate',
            '57A60000-0000-4000-8000-000000000003', '57A60000-0000-4000-8000-000000000004', N'and', 0, 0, N's', N's');

    -- Act
    CREATE TABLE #Gate (GateDefinitionId UNIQUEIDENTIFIER, GateName NVARCHAR(200), FromStageKey NVARCHAR(64), ToStageKey NVARCHAR(64), FromStageLabel NVARCHAR(120), ToStageLabel NVARCHAR(120));
    INSERT INTO #Gate
    EXEC dbo.usp_GetGateForTransition @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ToStage = N'validation';

    -- Assert
    DECLARE @Count INT           = (SELECT COUNT(*) FROM #Gate);
    DECLARE @ToLabel NVARCHAR(120) = (SELECT ToStageLabel FROM #Gate);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    EXEC tSQLt.AssertEqualsString @Expected = N'Validation', @Actual = @ToLabel;
END;
GO

CREATE PROCEDURE GatesTests.[test_GetGateForTransitionUngatedEdgeReturnsNothing]
AS
BEGIN
    -- Arrange — record at 'execution'; the gate guards execution → validation, but we ask for execution → delivery.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', N'R', N'execution', N'{}', 0, N's', N's');
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('57A60000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'execution', N'Execution', N'Execution', 2, 0, N's', N's'),
           ('57A60000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'validation', N'Validation', N'Validation', 3, 0, N's', N's');
    INSERT INTO dbo.GateDefinition (GateDefinitionId, LifecycleId, WorkspaceId, Name, FromStageId, ToStageId, JoinKind, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('6A7E0000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'QA readiness gate',
            '57A60000-0000-4000-8000-000000000003', '57A60000-0000-4000-8000-000000000004', N'and', 0, 0, N's', N's');

    -- Act
    CREATE TABLE #Gate (GateDefinitionId UNIQUEIDENTIFIER, GateName NVARCHAR(200), FromStageKey NVARCHAR(64), ToStageKey NVARCHAR(64), FromStageLabel NVARCHAR(120), ToStageLabel NVARCHAR(120));
    INSERT INTO #Gate
    EXEC dbo.usp_GetGateForTransition @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ToStage = N'delivery';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Gate);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

-- ── Open gate ────────────────────────────────────────────────────────────────────

CREATE PROCEDURE GatesTests.[test_OpenGateFreezesSlotsAndEligibleMembers]
AS
BEGIN
    -- Arrange — one slot (GCO) with one eligible member.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateApproverSlot';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', N'R', N'execution', N'{}', 0, N's', N's');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('57A60000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'execution', N'Execution', N'Execution', 2, 0, N's', N's'),
           ('57A60000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'validation', N'Validation', N'Validation', 3, 0, N's', N's');
    INSERT INTO dbo.GateDefinition (GateDefinitionId, LifecycleId, WorkspaceId, Name, FromStageId, ToStageId, JoinKind, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('6A7E0000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'QA readiness gate',
            '57A60000-0000-4000-8000-000000000003', '57A60000-0000-4000-8000-000000000004', N'and', 0, 0, N's', N's');
    INSERT INTO dbo.GateApproverSlot (GateApproverSlotId, GateDefinitionId, RoleLabel, SlotIndex, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '6A7E0000-0000-4000-8000-000000000001', N'GCO', 0, 0, N's', N's');
    INSERT INTO dbo.ApproverTeamMembership (WorkspaceId, RoleLabel, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'GCO', '00000000-0000-4000-8000-0000000000cc', 0, N's', N's');
    INSERT INTO dbo.Users (UserId, DisplayName, Email, LastSignInAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('00000000-0000-4000-8000-0000000000cc', N'Casey', N'casey@example.test', SYSUTCDATETIME(), 0, N's', N's');

    -- Act
    EXEC dbo.usp_OpenGate @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @GateDefinitionId = '6A7E0000-0000-4000-8000-000000000001', @OpenedByUserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — one Pending gate, gate name + transition frozen, and the member frozen into slot 0.
    DECLARE @Count  INT           = (SELECT COUNT(*) FROM dbo.ApprovalRequests);
    DECLARE @State  NVARCHAR(24)  = (SELECT State FROM dbo.ApprovalRequests);
    DECLARE @ToKey  NVARCHAR(64)  = (SELECT ToStageKey FROM dbo.ApprovalRequests);
    DECLARE @Member UNIQUEIDENTIFIER = (
        SELECT TOP 1 mem.userId
        FROM dbo.ApprovalRequests AS ar
        CROSS APPLY OPENJSON(ar.FrozenApproverSet) WITH (slotIndex INT '$.slotIndex', eligibleMembers NVARCHAR(MAX) '$.eligibleMembers' AS JSON) AS slot
        CROSS APPLY OPENJSON(slot.eligibleMembers) WITH (userId UNIQUEIDENTIFIER '$.userId') AS mem
        WHERE slot.slotIndex = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    EXEC tSQLt.AssertEqualsString @Expected = N'Pending', @Actual = @State;
    EXEC tSQLt.AssertEqualsString @Expected = N'validation', @Actual = @ToKey;
    EXEC tSQLt.AssertEquals @Expected = '00000000-0000-4000-8000-0000000000cc', @Actual = @Member;
END;
GO

CREATE PROCEDURE GatesTests.[test_OpenGateWhenOneAlreadyOpenThrows]
AS
BEGIN
    -- Arrange — an unresolved gate already exists on the record.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateApproverSlot';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', N'R', N'execution', N'{}', 0, N's', N's');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.GateDefinition (GateDefinitionId, LifecycleId, WorkspaceId, Name, FromStageId, ToStageId, JoinKind, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('6A7E0000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '1A150000-0000-4000-8000-000000000001', N'QA readiness gate',
            '57A60000-0000-4000-8000-000000000003', '57A60000-0000-4000-8000-000000000004', N'and', 0, 0, N's', N's');
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId, GateName, FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State, FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('7A000000-0000-4000-8000-000000000001', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '6A7E0000-0000-4000-8000-000000000001', N'QA readiness gate', N'execution', N'validation', N'Execution', N'Validation', N'Pending', N'[]', 0, N's', N's');

    -- Assert — a second open THROWs 50051 (→ 409 gate-already-open).
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50051;

    -- Act
    EXEC dbo.usp_OpenGate @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @GateDefinitionId = '6A7E0000-0000-4000-8000-000000000001', @OpenedByUserId = '00000000-0000-4000-8000-0000000000aa';
END;
GO

CREATE PROCEDURE GatesTests.[test_OpenGateDeniedForNonMemberInsertsNothing]
AS
BEGIN
    -- Arrange — record exists, caller has no membership.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateApproverSlot';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', N'R', N'execution', N'{}', 0, N's', N's');

    -- Act
    EXEC dbo.usp_OpenGate @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @GateDefinitionId = '6A7E0000-0000-4000-8000-000000000001', @OpenedByUserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert — no gate opened.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.ApprovalRequests);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

-- ── Submit decision ───────────────────────────────────────────────────────────────

CREATE PROCEDURE GatesTests.[test_SubmitDecisionApproveSingleSlotResolvesAndAdvances]
AS
BEGIN
    -- Arrange — one-slot gate; the eligible member approves.
    EXEC GatesTests.[SeedSingleSlotGate];

    -- Act
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000cc', @Decision = N'Approved', @Comment = NULL, @IsProxy = 0;

    -- Assert — gate Resolved and the record advanced to the target stage.
    DECLARE @State  NVARCHAR(24) = (SELECT State FROM dbo.ApprovalRequests);
    DECLARE @Stage  NVARCHAR(64) = (SELECT Stage FROM dbo.Requests);
    DECLARE @Signer UNIQUEIDENTIFIER = (SELECT DecidedByUserId FROM dbo.ApprovalDecisions);
    EXEC tSQLt.AssertEqualsString @Expected = N'Resolved', @Actual = @State;
    EXEC tSQLt.AssertEqualsString @Expected = N'validation', @Actual = @Stage;
    EXEC tSQLt.AssertEquals @Expected = '00000000-0000-4000-8000-0000000000cc', @Actual = @Signer;
END;
GO

CREATE PROCEDURE GatesTests.[test_SubmitDecisionRejectRequiresCommentThrows]
AS
BEGIN
    -- Arrange
    EXEC GatesTests.[SeedSingleSlotGate];

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50053;

    -- Act — reject with no comment.
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000cc', @Decision = N'Rejected', @Comment = N'   ', @IsProxy = 0;
END;
GO

CREATE PROCEDURE GatesTests.[test_SubmitDecisionRejectSetsChangesRequestedAndDoesNotAdvance]
AS
BEGIN
    -- Arrange
    EXEC GatesTests.[SeedSingleSlotGate];

    -- Act — reject with a comment.
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000cc', @Decision = N'Rejected', @Comment = N'Needs a load test first', @IsProxy = 0;

    -- Assert — gate ChangesRequested; the record stays on its original stage.
    DECLARE @State NVARCHAR(24) = (SELECT State FROM dbo.ApprovalRequests);
    DECLARE @Stage NVARCHAR(64) = (SELECT Stage FROM dbo.Requests);
    EXEC tSQLt.AssertEqualsString @Expected = N'ChangesRequested', @Actual = @State;
    EXEC tSQLt.AssertEqualsString @Expected = N'execution', @Actual = @Stage;
END;
GO

CREATE PROCEDURE GatesTests.[test_SubmitDecisionIneligibleSignerThrows]
AS
BEGIN
    -- Arrange — signer 'ee' is neither in the frozen set nor a team member.
    EXEC GatesTests.[SeedSingleSlotGate];

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50057;

    -- Act
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000ee', @Decision = N'Approved', @Comment = NULL, @IsProxy = 0;
END;
GO

CREATE PROCEDURE GatesTests.[test_SubmitDecisionUnknownSlotThrows]
AS
BEGIN
    -- Arrange
    EXEC GatesTests.[SeedSingleSlotGate];

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50056;

    -- Act — slot index 5 is not in the frozen single-slot gate.
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 5,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000cc', @Decision = N'Approved', @Comment = NULL, @IsProxy = 0;
END;
GO

CREATE PROCEDURE GatesTests.[test_SubmitDecisionProxyBypassesEligibility]
AS
BEGIN
    -- Arrange — proxy signer 'ee' is NOT eligible; a WORKSPACE ADMIN records the off-platform sign-off.
    EXEC GatesTests.[SeedSingleSlotGate];
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000af', N'WorkspaceAdmin', 0);

    -- Act — the admin ('af') proxies the sign-off for the ineligible signer ('ee').
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000af', @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000ee', @Decision = N'Approved', @Comment = NULL, @IsProxy = 1;

    -- Assert — resolves despite the ineligible signer, and the decision is flagged proxy.
    DECLARE @State  NVARCHAR(24) = (SELECT State FROM dbo.ApprovalRequests);
    DECLARE @Proxy  BIT          = (SELECT IsProxy FROM dbo.ApprovalDecisions);
    EXEC tSQLt.AssertEqualsString @Expected = N'Resolved', @Actual = @State;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Proxy;
END;
GO

CREATE PROCEDURE GatesTests.[test_SubmitDecisionTwoSlotAndJoinResolvesOnlyWhenBothApprove]
AS
BEGIN
    -- Arrange — two-slot AND-join gate (GCO + InfoSec).
    EXEC GatesTests.[SeedTwoSlotGate];

    -- Act 1 — approve slot 0 only.
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000cc', @Decision = N'Approved', @Comment = NULL, @IsProxy = 0;

    -- Assert 1 — still Pending; record not advanced.
    DECLARE @State1 NVARCHAR(24) = (SELECT State FROM dbo.ApprovalRequests);
    DECLARE @Stage1 NVARCHAR(64) = (SELECT Stage FROM dbo.Requests);
    EXEC tSQLt.AssertEqualsString @Expected = N'Pending', @Actual = @State1;
    EXEC tSQLt.AssertEqualsString @Expected = N'execution', @Actual = @Stage1;

    -- Act 2 — approve slot 1.
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 1,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000dd', @Decision = N'Approved', @Comment = NULL, @IsProxy = 0;

    -- Assert 2 — both approved → Resolved + advanced.
    DECLARE @State2 NVARCHAR(24) = (SELECT State FROM dbo.ApprovalRequests);
    DECLARE @Stage2 NVARCHAR(64) = (SELECT Stage FROM dbo.Requests);
    EXEC tSQLt.AssertEqualsString @Expected = N'Resolved', @Actual = @State2;
    EXEC tSQLt.AssertEqualsString @Expected = N'validation', @Actual = @Stage2;
END;
GO

CREATE PROCEDURE GatesTests.[test_SubmitDecisionDeniedForNonMemberReturnsNothing]
AS
BEGIN
    -- Arrange — caller 'bb' is not a member.
    EXEC GatesTests.[SeedSingleSlotGate];

    -- Act
    CREATE TABLE #Ar (ApprovalRequestId UNIQUEIDENTIFIER, RequestRecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER,
        GateDefinitionId UNIQUEIDENTIFIER, GateName NVARCHAR(200), FromStageKey NVARCHAR(64), ToStageKey NVARCHAR(64),
        FromStageLabel NVARCHAR(120), ToStageLabel NVARCHAR(120), State NVARCHAR(24), OpenedAt DATETIME2, ResolvedAt DATETIME2,
        FrozenApproverSet NVARCHAR(MAX), DecisionsJson NVARCHAR(MAX));
    INSERT INTO #Ar
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000bb', @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000cc', @Decision = N'Approved', @Comment = NULL, @IsProxy = 0;

    -- Assert — nothing returned (→ 403) and no decision recorded.
    DECLARE @Returned INT = (SELECT COUNT(*) FROM #Ar);
    DECLARE @Decisions INT = (SELECT COUNT(*) FROM dbo.ApprovalDecisions);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Returned;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Decisions;
END;
GO

-- ── Re-request ─────────────────────────────────────────────────────────────────

CREATE PROCEDURE GatesTests.[test_ReRequestReturnsRejectedSlotToPendingAndRetainsHistory]
AS
BEGIN
    -- Arrange — reject the single slot first, then re-request it.
    EXEC GatesTests.[SeedSingleSlotGate];
    EXEC dbo.usp_SubmitDecision @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000cc', @Decision = N'Rejected', @Comment = N'Add error handling', @IsProxy = 0;

    -- Act
    EXEC dbo.usp_ReRequestApproval @ApprovalRequestId = '7A000000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @SlotIndex = 0;

    -- Assert — gate back to Pending; the rejection row is retained (superseded, not deleted).
    DECLARE @State       NVARCHAR(24) = (SELECT State FROM dbo.ApprovalRequests);
    DECLARE @TotalRows   INT = (SELECT COUNT(*) FROM dbo.ApprovalDecisions);
    DECLARE @LiveRows    INT = (SELECT COUNT(*) FROM dbo.ApprovalDecisions WHERE SupersededAt IS NULL);
    EXEC tSQLt.AssertEqualsString @Expected = N'Pending', @Actual = @State;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @TotalRows;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @LiveRows;
END;
GO

-- ── Read (list) ─────────────────────────────────────────────────────────────────

CREATE PROCEDURE GatesTests.[test_GetApprovalRequestsForRecordDeniedForNonMemberReturnsNothing]
AS
BEGIN
    -- Arrange — a gate exists but the caller is not a member.
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalDecisions';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId, GateName, FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State, FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('7A000000-0000-4000-8000-000000000001', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '6A7E0000-0000-4000-8000-000000000001', N'QA readiness gate', N'execution', N'validation', N'Execution', N'Validation', N'Pending', N'[]', 0, N's', N's');

    -- Act
    CREATE TABLE #Ar (ApprovalRequestId UNIQUEIDENTIFIER, RequestRecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER,
        GateDefinitionId UNIQUEIDENTIFIER, GateName NVARCHAR(200), FromStageKey NVARCHAR(64), ToStageKey NVARCHAR(64),
        FromStageLabel NVARCHAR(120), ToStageLabel NVARCHAR(120), State NVARCHAR(24), OpenedAt DATETIME2, ResolvedAt DATETIME2,
        FrozenApproverSet NVARCHAR(MAX), DecisionsJson NVARCHAR(MAX));
    INSERT INTO #Ar
    EXEC dbo.usp_GetApprovalRequestsForRecord @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Ar);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

-- ── Shared seed helpers ──────────────────────────────────────────────────────────
-- Not test_ procedures, so tSQLt does not run them directly; called from the tests above.

CREATE PROCEDURE GatesTests.[SeedSingleSlotGate]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalDecisions';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', N'R', N'execution', N'{"stage":"execution"}', 0, N's', N's');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.ApproverTeamMembership (WorkspaceId, RoleLabel, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'GCO', '00000000-0000-4000-8000-0000000000cc', 0, N's', N's');
    INSERT INTO dbo.Users (UserId, DisplayName, Email, LastSignInAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('00000000-0000-4000-8000-0000000000cc', N'Casey', N'casey@example.test', SYSUTCDATETIME(), 0, N's', N's'),
           ('00000000-0000-4000-8000-0000000000ee', N'Erin',  N'erin@example.test',  SYSUTCDATETIME(), 0, N's', N's');
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId, GateName, FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State, FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('7A000000-0000-4000-8000-000000000001', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '6A7E0000-0000-4000-8000-000000000001', N'QA readiness gate', N'execution', N'validation', N'Execution', N'Validation', N'Pending',
            N'[{"slotIndex":0,"roleLabel":"GCO","displayLabel":"GCO","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000cc","displayName":"Casey"}]}]', 0, N's', N's');
END;
GO

CREATE PROCEDURE GatesTests.[SeedTwoSlotGate]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApproverTeamMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalDecisions';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', N'R', N'execution', N'{"stage":"execution"}', 0, N's', N's');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.ApproverTeamMembership (WorkspaceId, RoleLabel, UserId, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'GCO',     '00000000-0000-4000-8000-0000000000cc', 0, N's', N's'),
           ('1A150000-0000-4000-8000-000000000001', N'InfoSec', '00000000-0000-4000-8000-0000000000dd', 0, N's', N's');
    INSERT INTO dbo.Users (UserId, DisplayName, Email, LastSignInAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('00000000-0000-4000-8000-0000000000cc', N'Casey', N'casey@example.test', SYSUTCDATETIME(), 0, N's', N's'),
           ('00000000-0000-4000-8000-0000000000dd', N'Dana',  N'dana@example.test',  SYSUTCDATETIME(), 0, N's', N's');
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId, GateDefinitionId, GateName, FromStageKey, ToStageKey, FromStageLabel, ToStageLabel, State, FrozenApproverSet, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('7A000000-0000-4000-8000-000000000001', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '6A7E0000-0000-4000-8000-000000000001', N'QA readiness gate', N'execution', N'validation', N'Execution', N'Validation', N'Pending',
            N'[{"slotIndex":0,"roleLabel":"GCO","displayLabel":"GCO","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000cc","displayName":"Casey"}]},{"slotIndex":1,"roleLabel":"InfoSec","displayLabel":"InfoSec","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000dd","displayName":"Dana"}]}]', 0, N's', N's');
END;
GO
