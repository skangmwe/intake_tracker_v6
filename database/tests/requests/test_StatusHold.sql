-- =============================================
-- tSQLt tests for Slice 26 — Record Status/hold model + guards.
-- Covers:
--   usp_UpsertRequestStatusHold — tri-state write + JSON mirror + validation + not-found.
--   usp_PatchTask hold guard (D3) — fires only on Status→'Done' when parent record is
--                                    OnHold or Abandoned; other patches (title/notes) still work.
--   usp_SubmitDecision hold guard — blocks Approve AND Reject when parent record is held.
--   usp_SetRequestStage hold guard — blocks advance when record is held.
--   Migration 061 backfill logic — JSON `$.holdBlocked='true'` → StatusHold='OnHold' (idempotent).
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'StatusHoldTests';
GO

-- ── usp_UpsertRequestStatusHold ───────────────────────────────────────────────

CREATE PROCEDURE StatusHoldTests.[test_UpsertStatusHoldSetsOnHoldWithNoteAndMirror]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              StatusHoldNote, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Test', N'intake', N'InProgress',
            NULL, N'{"stage":"intake"}', 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_UpsertRequestStatusHold
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @StatusHold = N'OnHold', @Note = N'Waiting on client', @ActorUserId = N'actor';

    -- Assert — column + JSON mirror both reflect the hold.
    DECLARE @Sh   NVARCHAR(20)  = (SELECT StatusHold     FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Note NVARCHAR(500) = (SELECT StatusHoldNote FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Blk  NVARCHAR(5)   = (SELECT JSON_VALUE(FieldValues, N'$.holdBlocked') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Rsn  NVARCHAR(500) = (SELECT JSON_VALUE(FieldValues, N'$.holdReason')  FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEqualsString @Expected = N'OnHold',           @Actual = @Sh;
    EXEC tSQLt.AssertEqualsString @Expected = N'Waiting on client', @Actual = @Note;
    EXEC tSQLt.AssertEqualsString @Expected = N'true',              @Actual = @Blk;
    EXEC tSQLt.AssertEqualsString @Expected = N'Waiting on client', @Actual = @Rsn;
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_UpsertStatusHoldAbandonedMirrorsHeldTrue]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Test', N'intake', N'InProgress',
            N'{}', 0, N'seed', N'seed');

    -- Act — Abandoned uses the same "held" semantics as OnHold; only the pill copy differs.
    EXEC dbo.usp_UpsertRequestStatusHold
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @StatusHold = N'Abandoned', @Note = N'Superseded by AIS-42', @ActorUserId = N'actor';

    -- Assert
    DECLARE @Sh  NVARCHAR(20) = (SELECT StatusHold FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Blk NVARCHAR(5)  = (SELECT JSON_VALUE(FieldValues, N'$.holdBlocked') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEqualsString @Expected = N'Abandoned', @Actual = @Sh;
    EXEC tSQLt.AssertEqualsString @Expected = N'true',       @Actual = @Blk;
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_UpsertStatusHoldInProgressClearsNoteAndMirror]
AS
BEGIN
    -- Arrange — a currently-held record.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              StatusHoldNote, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Test', N'intake', N'OnHold',
            N'Prior reason', N'{"holdBlocked":"true","holdReason":"Prior reason"}',
            0, N'seed', N'seed');

    -- Act — reactivate.
    EXEC dbo.usp_UpsertRequestStatusHold
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @StatusHold = N'InProgress', @Note = NULL, @ActorUserId = N'actor';

    -- Assert — column, note, and both JSON keys all cleared.
    DECLARE @Sh   NVARCHAR(20)  = (SELECT StatusHold     FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Note NVARCHAR(500) = (SELECT StatusHoldNote FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Blk  NVARCHAR(5)   = (SELECT JSON_VALUE(FieldValues, N'$.holdBlocked') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Rsn  NVARCHAR(500) = (SELECT JSON_VALUE(FieldValues, N'$.holdReason')  FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEqualsString @Expected = N'InProgress', @Actual = @Sh;
    EXEC tSQLt.AssertEquals       @Expected = NULL,          @Actual = @Note;
    EXEC tSQLt.AssertEqualsString @Expected = N'false',       @Actual = @Blk;
    EXEC tSQLt.AssertEquals       @Expected = NULL,          @Actual = @Rsn;
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_UpsertStatusHoldRejectsUnknownValue]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Test', N'intake', N'InProgress',
            N'{}', 0, N'seed', N'seed');

    -- Act + Assert — invalid value THROW 50060.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%must be InProgress, OnHold, or Abandoned%';
    EXEC dbo.usp_UpsertRequestStatusHold
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @StatusHold = N'Paused', @Note = NULL, @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_UpsertStatusHoldRejectsUnknownRecord]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';

    -- Act + Assert — no matching row THROW 50043.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%request not found%';
    EXEC dbo.usp_UpsertRequestStatusHold
        @RecordId = N'AIS-99999999', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @StatusHold = N'OnHold', @Note = NULL, @ActorUserId = N'actor';
END;
GO

-- ── usp_PatchTask hold guard (D3) ─────────────────────────────────────────────

CREATE PROCEDURE StatusHoldTests.[test_PatchTaskDoneOnHoldRecordThrows]
AS
BEGIN
    -- Arrange — a held record, a member caller, a task on it.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Rec', N'build', N'OnHold',
            N'{"holdBlocked":"true"}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder,
                           IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('55555555-5555-4555-8555-555555555555', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001', N'Do it', N'Build', N'Open', 1, 0, N'seed', N'seed');

    -- Act + Assert — Status→Done on a held parent throws 51201.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%record is on hold%';
    EXEC dbo.usp_PatchTask
        @TaskId = '55555555-5555-4555-8555-555555555555',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetTitle = 0, @Title = NULL, @SetPhase = 0, @Phase = NULL,
        @SetAssignee = 0, @AssigneeUserId = NULL,
        @SetStatus = 1, @Status = N'Done',
        @SetNotes = 0, @Notes = NULL,
        @SetTypedFieldValue = 0,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_PatchTaskDoneAbandonedRecordThrows]
AS
BEGIN
    -- Arrange — Abandoned records block completion the same as OnHold.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Rec', N'build', N'Abandoned',
            N'{"holdBlocked":"true"}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder,
                           IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('55555555-5555-4555-8555-555555555555', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001', N'Do it', N'Build', N'Open', 1, 0, N'seed', N'seed');

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%record is on hold%';
    EXEC dbo.usp_PatchTask
        @TaskId = '55555555-5555-4555-8555-555555555555',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetTitle = 0, @Title = NULL, @SetPhase = 0, @Phase = NULL,
        @SetAssignee = 0, @AssigneeUserId = NULL,
        @SetStatus = 1, @Status = N'Done',
        @SetNotes = 0, @Notes = NULL,
        @SetTypedFieldValue = 0,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_PatchTaskNotesEditableWhileOnHold]
AS
BEGIN
    -- Arrange — held record; caller edits Notes (not Status).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Rec', N'build', N'OnHold',
            N'{"holdBlocked":"true"}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder,
                           IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('55555555-5555-4555-8555-555555555555', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001', N'Do it', N'Build', N'Open', 1, 0, N'seed', N'seed');

    -- Act — Notes-only edit on a held record must succeed (D3 — only Done is blocked).
    EXEC dbo.usp_PatchTask
        @TaskId = '55555555-5555-4555-8555-555555555555',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetTitle = 0, @Title = NULL, @SetPhase = 0, @Phase = NULL,
        @SetAssignee = 0, @AssigneeUserId = NULL,
        @SetStatus = 0, @Status = NULL,
        @SetNotes = 1, @Notes = N'Follow-up captured while on hold',
        @SetTypedFieldValue = 0,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert — Notes wrote through; Status unchanged.
    DECLARE @Notes  NVARCHAR(MAX) = (SELECT Notes  FROM dbo.Tasks WHERE TaskId = '55555555-5555-4555-8555-555555555555');
    DECLARE @Status NVARCHAR(16)  = (SELECT Status FROM dbo.Tasks WHERE TaskId = '55555555-5555-4555-8555-555555555555');
    EXEC tSQLt.AssertEqualsString @Expected = N'Follow-up captured while on hold', @Actual = @Notes;
    EXEC tSQLt.AssertEqualsString @Expected = N'Open',                              @Actual = @Status;
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_PatchTaskDoneInProgressRecordSucceeds]
AS
BEGIN
    -- Arrange — control case: an InProgress parent allows completion.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Rec', N'build', N'InProgress',
            N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder,
                           IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('55555555-5555-4555-8555-555555555555', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001', N'Do it', N'Build', N'Open', 1, 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_PatchTask
        @TaskId = '55555555-5555-4555-8555-555555555555',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetTitle = 0, @Title = NULL, @SetPhase = 0, @Phase = NULL,
        @SetAssignee = 0, @AssigneeUserId = NULL,
        @SetStatus = 1, @Status = N'Done',
        @SetNotes = 0, @Notes = NULL,
        @SetTypedFieldValue = 0,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert — Status flipped to Done, CompletedAt stamped.
    DECLARE @Status NVARCHAR(16) = (SELECT Status FROM dbo.Tasks WHERE TaskId = '55555555-5555-4555-8555-555555555555');
    DECLARE @Completed DATETIME2 = (SELECT CompletedAt FROM dbo.Tasks WHERE TaskId = '55555555-5555-4555-8555-555555555555');
    EXEC tSQLt.AssertEqualsString @Expected = N'Done', @Actual = @Status;
    EXEC tSQLt.AssertNotEquals    @Expected = NULL,    @Actual = @Completed;
END;
GO

-- ── usp_SubmitDecision hold guard ─────────────────────────────────────────────

CREATE PROCEDURE StatusHoldTests.[test_SubmitDecisionApproveOnHoldRecordThrows]
AS
BEGIN
    -- Arrange — held record + a Pending approval on it.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalDecisions';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Rec', N'build', N'OnHold',
            N'{"holdBlocked":"true"}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId,
                                       State, FrozenApproverSet, ToStageKey,
                                       IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('AAAAAAAA-0000-4000-8000-000000000001', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001', N'Pending',
            N'[{"slotIndex":0,"roleLabel":"Manager","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000aa","displayName":"Ana"}]}]',
            N'review', 0, N'seed', N'seed');

    -- Act + Assert — Approve on a held record throws before eligibility check.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%record is on hold%';
    EXEC dbo.usp_SubmitDecision
        @ApprovalRequestId = 'AAAAAAAA-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000aa',
        @Decision = N'Approved', @Comment = NULL, @IsProxy = 0;
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_SubmitDecisionRejectOnHoldRecordThrows]
AS
BEGIN
    -- Arrange — same setup, decision = Reject with a comment (would otherwise pass all other checks).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalDecisions';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Rec', N'build', N'Abandoned',
            N'{"holdBlocked":"true"}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.ApprovalRequests (ApprovalRequestId, RequestRecordId, WorkspaceId,
                                       State, FrozenApproverSet, ToStageKey,
                                       IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('AAAAAAAA-0000-4000-8000-000000000001', N'AIS-00000001',
            '1A150000-0000-4000-8000-000000000001', N'Pending',
            N'[{"slotIndex":0,"roleLabel":"Manager","eligibleMembers":[{"userId":"00000000-0000-4000-8000-0000000000aa","displayName":"Ana"}]}]',
            N'review', 0, N'seed', N'seed');

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%record is on hold%';
    EXEC dbo.usp_SubmitDecision
        @ApprovalRequestId = 'AAAAAAAA-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SlotIndex = 0,
        @DecidedByUserId = '00000000-0000-4000-8000-0000000000aa',
        @Decision = N'Rejected', @Comment = N'Blocked', @IsProxy = 0;
END;
GO

-- ── usp_SetRequestStage hold guard ────────────────────────────────────────────

CREATE PROCEDURE StatusHoldTests.[test_SetStageOnHoldRecordThrows]
AS
BEGIN
    -- Arrange — held record; target stage IS on the lifecycle (would otherwise succeed).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              StageEnteredAt, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Rec', N'intake', N'OnHold',
            '2026-01-01T00:00:00', N'{"stage":"intake","holdBlocked":"true"}',
            0, N'seed', N'seed');
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey,
                                     Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '22222222-2222-4222-8222-222222222222', '1A150000-0000-4000-8000-000000000001',
            N'review', N'Review', N'Review', 1, 0, N'seed', N'seed');

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%record is on hold%';
    EXEC dbo.usp_SetRequestStage
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @ToStage = N'review', @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_SetStageInProgressRecordSucceeds]
AS
BEGIN
    -- Arrange — control case.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              StageEnteredAt, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'Rec', N'intake', N'InProgress',
            '2026-01-01T00:00:00', N'{"stage":"intake"}', 0, N'seed', N'seed');
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey,
                                     Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '22222222-2222-4222-8222-222222222222', '1A150000-0000-4000-8000-000000000001',
            N'review', N'Review', N'Review', 1, 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_SetRequestStage
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @ToStage = N'review', @ActorUserId = N'actor';

    -- Assert
    DECLARE @Stage NVARCHAR(64) = (SELECT Stage FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEqualsString @Expected = N'review', @Actual = @Stage;
END;
GO

-- ── Migration 061 backfill logic (JSON → column) ──────────────────────────────

-- The migration is idempotent by construction: it only updates rows where StatusHold is
-- still 'InProgress' AND the JSON key says 'true'. A second run makes no changes because
-- StatusHold is now 'OnHold'. These tests exercise the WHERE-clause logic directly.

CREATE PROCEDURE StatusHoldTests.[test_BackfillLogicPromotesJsonTrueOnly]
AS
BEGIN
    -- Arrange — three rows: JSON true, JSON false, JSON missing.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              StatusHoldNote, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'A', N'intake', N'InProgress', NULL,
            N'{"holdBlocked":"true","holdReason":"Waiting on client"}', 0, N'seed', N'seed'),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'B', N'intake', N'InProgress', NULL,
            N'{"holdBlocked":"false"}', 0, N'seed', N'seed'),
           (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'C', N'intake', N'InProgress', NULL,
            N'{}', 0, N'seed', N'seed');

    -- Act — same WHERE clause as migration 061.
    UPDATE dbo.Requests
       SET StatusHold     = N'OnHold',
           StatusHoldNote = NULLIF(LTRIM(RTRIM(ISNULL(JSON_VALUE(FieldValues, N'$.holdReason'), N''))), N''),
           UpdatedBy      = N'system-migration'
     WHERE IsDeleted  = 0
       AND StatusHold = N'InProgress'
       AND LOWER(ISNULL(JSON_VALUE(FieldValues, N'$.holdBlocked'), N'')) = N'true';

    -- Assert — only AIS-00000001 was promoted; note copied from JSON.
    DECLARE @A NVARCHAR(20) = (SELECT StatusHold FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @B NVARCHAR(20) = (SELECT StatusHold FROM dbo.Requests WHERE RecordId = N'AIS-00000002');
    DECLARE @C NVARCHAR(20) = (SELECT StatusHold FROM dbo.Requests WHERE RecordId = N'AIS-00000003');
    DECLARE @Note NVARCHAR(500) = (SELECT StatusHoldNote FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEqualsString @Expected = N'OnHold',             @Actual = @A;
    EXEC tSQLt.AssertEqualsString @Expected = N'InProgress',         @Actual = @B;
    EXEC tSQLt.AssertEqualsString @Expected = N'InProgress',         @Actual = @C;
    EXEC tSQLt.AssertEqualsString @Expected = N'Waiting on client',  @Actual = @Note;
END;
GO

CREATE PROCEDURE StatusHoldTests.[test_BackfillLogicIsIdempotent]
AS
BEGIN
    -- Arrange — a row already at OnHold from a prior backfill.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StatusHold,
                              StatusHoldNote, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222', N'A', N'intake', N'OnHold', N'Prior',
            N'{"holdBlocked":"true","holdReason":"Prior"}', 0, N'seed', N'seed');

    -- Act — second run: same WHERE clause. StatusHold='OnHold' so the row is skipped.
    UPDATE dbo.Requests
       SET StatusHold     = N'OnHold',
           StatusHoldNote = NULLIF(LTRIM(RTRIM(ISNULL(JSON_VALUE(FieldValues, N'$.holdReason'), N''))), N''),
           UpdatedBy      = N'system-migration-rerun'
     WHERE IsDeleted  = 0
       AND StatusHold = N'InProgress'
       AND LOWER(ISNULL(JSON_VALUE(FieldValues, N'$.holdBlocked'), N'')) = N'true';

    DECLARE @UpdatedBy NVARCHAR(256) = (SELECT UpdatedBy FROM dbo.Requests WHERE RecordId = N'AIS-00000001');

    -- Assert — UpdatedBy stayed at 'seed' → the row was not touched on rerun.
    EXEC tSQLt.AssertEqualsString @Expected = N'seed', @Actual = @UpdatedBy;
END;
GO
