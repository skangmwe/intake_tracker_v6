-- =============================================
-- tSQLt tests for the escalation bridge procs (Slice 9).
-- Covers: usp_EscalateRequest (adopt shared ID, land on AI Intake, resolve Origin,
--         snapshot + lock crossing fields, one-time/one-way guard, no-AI-record guard),
--         usp_GetBridgeForRecord (escalated read, not-escalated → empty, non-member → empty,
--         locked keys, caller-side flag). database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'EscalationTests';
GO

-- Shared arrange: an AI Solutions workspace + one PG workspace, an AI default lifecycle with
-- an Intake stage, a prefix registry that resolves the PG prefix, and one PG-side Request.
CREATE PROCEDURE EscalationTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Lifecycle';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.RequestCrossingSnapshot';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, IsDeleted)
    VALUES ('A1150000-0000-4000-8000-000000000001', N'AI Solutions', N'ai-solutions', N'AIS', 0),
           ('B0000000-0000-4000-8000-000000000002', N'Litigation',   N'pg-dept',      N'LIT', 0);

    INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, IsDeleted)
    VALUES (N'LIT', 'B0000000-0000-4000-8000-000000000002', N'Litigation', 0);

    INSERT INTO dbo.Lifecycle (LifecycleId, WorkspaceId, Name, RequestType, IsDefault, SortOrder, IsDeleted)
    VALUES ('C1000000-0000-4000-8000-000000000003', 'A1150000-0000-4000-8000-000000000001',
            N'Standard AI build', N'Full build', 1, 0, 0);

    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), 'C1000000-0000-4000-8000-000000000003', 'A1150000-0000-4000-8000-000000000001', N'intake',  N'Intake',  N'Intake', 0, 0, N'seed', N'seed'),
           (NEWID(), 'C1000000-0000-4000-8000-000000000003', 'A1150000-0000-4000-8000-000000000001', N'build',   N'Build',   N'Build',  2, 0, N'seed', N'seed');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Origin, Name, Description, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'LIT-00000001', 'B0000000-0000-4000-8000-000000000002', 'D2000000-0000-4000-8000-000000000004',
            N'Litigation', N'Contract clause finder', N'Find clauses fast.', N'intake',
            N'{"deptPgClient":"Litigation","requestor":"user-1"}', 0, N'seed', N'seed');
END;
GO

CREATE PROCEDURE EscalationTests.[test_EscalateCreatesAiRowWithSharedIdAtIntake]
AS
BEGIN
    -- Act
    DECLARE @AiWs UNIQUEIDENTIFIER;
    EXEC dbo.usp_EscalateRequest
        @RecordId          = N'LIT-00000001',
        @PgWorkspaceId     = 'B0000000-0000-4000-8000-000000000002',
        @Name              = N'Contract clause finder',
        @Description       = N'Find clauses fast.',
        @AiFieldValuesJson = N'{"deptPgClient":"Litigation","requestor":"user-1"}',
        @SnapshotJson      = N'[{"fieldKey":"deptPgClient","value":"\"Litigation\""},{"fieldKey":"requestor","value":"\"user-1\""}]',
        @ActorUserId       = N'00000000-0000-4000-8000-0000000000aa',
        @AiWorkspaceId     = @AiWs OUTPUT;

    -- Assert — the AI-side row adopts the shared RecordId, lands on Intake, resolves Origin.
    EXEC tSQLt.AssertEquals @Expected = 'A1150000-0000-4000-8000-000000000001', @Actual = @AiWs;

    DECLARE @Stage NVARCHAR(64) =
        (SELECT Stage FROM dbo.Requests WHERE RecordId = N'LIT-00000001' AND WorkspaceId = @AiWs);
    DECLARE @Origin NVARCHAR(200) =
        (SELECT Origin FROM dbo.Requests WHERE RecordId = N'LIT-00000001' AND WorkspaceId = @AiWs);
    DECLARE @Count INT =
        (SELECT COUNT(*) FROM dbo.Requests WHERE RecordId = N'LIT-00000001');

    EXEC tSQLt.AssertEquals @Expected = N'intake', @Actual = @Stage;
    EXEC tSQLt.AssertEquals @Expected = N'Litigation', @Actual = @Origin;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count; -- one row per side
END;
GO

CREATE PROCEDURE EscalationTests.[test_EscalateSnapshotsAndLocksCrossingFields]
AS
BEGIN
    -- Act
    DECLARE @AiWs UNIQUEIDENTIFIER;
    EXEC dbo.usp_EscalateRequest
        @RecordId          = N'LIT-00000001',
        @PgWorkspaceId     = 'B0000000-0000-4000-8000-000000000002',
        @Name              = N'Contract clause finder',
        @Description       = N'Find clauses fast.',
        @AiFieldValuesJson = N'{"deptPgClient":"Litigation"}',
        @SnapshotJson      = N'[{"fieldKey":"deptPgClient","value":"\"Litigation\""}]',
        @ActorUserId       = N'00000000-0000-4000-8000-0000000000aa',
        @AiWorkspaceId     = @AiWs OUTPUT;

    -- Assert — one locked snapshot on the PG side, preserving the escalation-time value.
    DECLARE @Locked BIT =
        (SELECT LockedAtEscalation FROM dbo.RequestCrossingSnapshot
         WHERE RecordId = N'LIT-00000001' AND FieldKey = N'deptPgClient');
    DECLARE @Value NVARCHAR(MAX) =
        (SELECT SnapshotValue FROM dbo.RequestCrossingSnapshot
         WHERE RecordId = N'LIT-00000001' AND FieldKey = N'deptPgClient');

    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Locked;
    EXEC tSQLt.AssertEquals @Expected = N'"Litigation"', @Actual = @Value;
END;
GO

CREATE PROCEDURE EscalationTests.[test_EscalateTwiceThrowsAlreadyEscalated]
AS
BEGIN
    -- Arrange — a first escalation already created the AI-side row.
    DECLARE @AiWs UNIQUEIDENTIFIER;
    EXEC dbo.usp_EscalateRequest
        @RecordId = N'LIT-00000001', @PgWorkspaceId = 'B0000000-0000-4000-8000-000000000002',
        @Name = N'X', @Description = N'Y', @AiFieldValuesJson = N'{}', @SnapshotJson = N'[]',
        @ActorUserId = N'actor', @AiWorkspaceId = @AiWs OUTPUT;

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%already been escalated%';

    -- Act — a second escalation must be rejected (one-time, one-way).
    EXEC dbo.usp_EscalateRequest
        @RecordId = N'LIT-00000001', @PgWorkspaceId = 'B0000000-0000-4000-8000-000000000002',
        @Name = N'X', @Description = N'Y', @AiFieldValuesJson = N'{}', @SnapshotJson = N'[]',
        @ActorUserId = N'actor', @AiWorkspaceId = @AiWs OUTPUT;
END;
GO

CREATE PROCEDURE EscalationTests.[test_EscalateAiRecordThrows]
AS
BEGIN
    -- Assert — escalating a record that already lives in the AI workspace is nonsensical.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%cannot be escalated%';

    -- Act
    DECLARE @AiWs UNIQUEIDENTIFIER;
    EXEC dbo.usp_EscalateRequest
        @RecordId = N'LIT-00000001', @PgWorkspaceId = 'A1150000-0000-4000-8000-000000000001',
        @Name = N'X', @Description = N'Y', @AiFieldValuesJson = N'{}', @SnapshotJson = N'[]',
        @ActorUserId = N'actor', @AiWorkspaceId = @AiWs OUTPUT;
END;
GO

CREATE PROCEDURE EscalationTests.[test_GetBridgeReturnsEscalatedForMember]
AS
BEGIN
    -- Arrange — escalate, then make the caller a PG-side member.
    DECLARE @AiWs UNIQUEIDENTIFIER;
    EXEC dbo.usp_EscalateRequest
        @RecordId = N'LIT-00000001', @PgWorkspaceId = 'B0000000-0000-4000-8000-000000000002',
        @Name = N'Contract clause finder', @Description = N'Find clauses fast.',
        @AiFieldValuesJson = N'{"deptPgClient":"Litigation"}',
        @SnapshotJson = N'[{"fieldKey":"deptPgClient","value":"\"Litigation\""}]',
        @ActorUserId = N'actor', @AiWorkspaceId = @AiWs OUTPUT;

    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('B0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    -- Act
    CREATE TABLE #Bridge (
        RecordId NVARCHAR(20), OriginWorkspaceId UNIQUEIDENTIFIER, OriginWorkspaceName NVARCHAR(200),
        AiWorkspaceId UNIQUEIDENTIFIER, EscalatedAt DATETIME2, AiStage NVARCHAR(64), AiFieldValues NVARCHAR(MAX),
        CallerWorkspaceId UNIQUEIDENTIFIER, CallerOnAiSide BIT, LockedFieldKeysJson NVARCHAR(MAX));
    INSERT INTO #Bridge
    EXEC dbo.usp_GetBridgeForRecord @RecordId = N'LIT-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — the PG member sees the bridge, on the PG side, with the locked key surfaced.
    DECLARE @Origin NVARCHAR(200)   = (SELECT OriginWorkspaceName FROM #Bridge);
    DECLARE @OnAiSide BIT           = (SELECT CallerOnAiSide FROM #Bridge);
    DECLARE @Locked NVARCHAR(MAX)   = (SELECT LockedFieldKeysJson FROM #Bridge);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Bridge);
    EXEC tSQLt.AssertEquals @Expected = N'Litigation', @Actual = @Origin;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OnAiSide;
    EXEC tSQLt.AssertEquals @Expected = N'[{"key":"deptPgClient"}]', @Actual = @Locked;
END;
GO

CREATE PROCEDURE EscalationTests.[test_GetBridgeEmptyWhenNotEscalated]
AS
BEGIN
    -- Arrange — caller is a member but the record was never escalated (no AI-side row).
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('B0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    -- Act
    CREATE TABLE #Bridge (
        RecordId NVARCHAR(20), OriginWorkspaceId UNIQUEIDENTIFIER, OriginWorkspaceName NVARCHAR(200),
        AiWorkspaceId UNIQUEIDENTIFIER, EscalatedAt DATETIME2, AiStage NVARCHAR(64), AiFieldValues NVARCHAR(MAX),
        CallerWorkspaceId UNIQUEIDENTIFIER, CallerOnAiSide BIT, LockedFieldKeysJson NVARCHAR(MAX));
    INSERT INTO #Bridge
    EXEC dbo.usp_GetBridgeForRecord @RecordId = N'LIT-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — no bridge block for a non-escalated record.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #Bridge);
END;
GO

CREATE PROCEDURE EscalationTests.[test_GetBridgeEmptyForNonMember]
AS
BEGIN
    -- Arrange — escalate, but the caller has no membership on either side.
    DECLARE @AiWs UNIQUEIDENTIFIER;
    EXEC dbo.usp_EscalateRequest
        @RecordId = N'LIT-00000001', @PgWorkspaceId = 'B0000000-0000-4000-8000-000000000002',
        @Name = N'X', @Description = N'Y', @AiFieldValuesJson = N'{}', @SnapshotJson = N'[]',
        @ActorUserId = N'actor', @AiWorkspaceId = @AiWs OUTPUT;

    -- Act
    CREATE TABLE #Bridge (
        RecordId NVARCHAR(20), OriginWorkspaceId UNIQUEIDENTIFIER, OriginWorkspaceName NVARCHAR(200),
        AiWorkspaceId UNIQUEIDENTIFIER, EscalatedAt DATETIME2, AiStage NVARCHAR(64), AiFieldValues NVARCHAR(MAX),
        CallerWorkspaceId UNIQUEIDENTIFIER, CallerOnAiSide BIT, LockedFieldKeysJson NVARCHAR(MAX));
    INSERT INTO #Bridge
    EXEC dbo.usp_GetBridgeForRecord @RecordId = N'LIT-00000001', @UserId = '00000000-0000-4000-8000-0000000000cc';

    -- Assert — existence is never disclosed to a non-member.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #Bridge);
END;
GO
