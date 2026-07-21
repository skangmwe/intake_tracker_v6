-- =============================================
-- tSQLt tests for the Requests core write/read procs (Slice 5).
-- Covers: create (mint + row + mirrored fields), access-baked read, ETag concurrency,
--         stage validation, and hold. database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'RequestsCoreTests';
GO

CREATE PROCEDURE RequestsCoreTests.[test_CreateRequestMintsAndMirrorsFields]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Workspaces (WorkspaceId, Prefix, NextSequence, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'AIS', 0, 0);
    INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, IsDeleted)
    VALUES (N'AIS', '1A150000-0000-4000-8000-000000000001', N'AI Solutions', 0);

    DECLARE @RecordId NVARCHAR(20);

    -- Act
    EXEC dbo.usp_CreateRequest
        @WorkspaceId     = '1A150000-0000-4000-8000-000000000001',
        @LifecycleId     = '22222222-2222-4222-8222-222222222222',
        @Stage           = N'intake',
        @Name            = N'Meeting-notes action extraction',
        @Description     = N'Pull action items out of matter-team meetings.',
        @FieldValuesJson = N'{"businessValue":4,"efficiencyGain":3,"levelOfEffort":2}',
        @ActorUserId     = N'00000000-0000-4000-8000-0000000000aa',
        @RecordId        = @RecordId OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @RecordId;

    DECLARE @Stage NVARCHAR(64) = (SELECT Stage FROM dbo.Requests WHERE RecordId = @RecordId);
    DECLARE @Origin NVARCHAR(200) = (SELECT Origin FROM dbo.Requests WHERE RecordId = @RecordId);
    DECLARE @MirroredStage NVARCHAR(64) =
        (SELECT JSON_VALUE(FieldValues, N'$.stage') FROM dbo.Requests WHERE RecordId = @RecordId);
    DECLARE @MirroredName NVARCHAR(400) =
        (SELECT JSON_VALUE(FieldValues, N'$.name') FROM dbo.Requests WHERE RecordId = @RecordId);

    EXEC tSQLt.AssertEquals @Expected = N'intake', @Actual = @Stage;
    EXEC tSQLt.AssertEquals @Expected = N'AI Solutions', @Actual = @Origin;
    EXEC tSQLt.AssertEquals @Expected = N'intake', @Actual = @MirroredStage;
    EXEC tSQLt.AssertEquals @Expected = N'Meeting-notes action extraction', @Actual = @MirroredName;

    -- Slice 21: StageEnteredAt is stamped on create (drives time-in-stage).
    DECLARE @StageEnteredAt DATETIME2 = (SELECT StageEnteredAt FROM dbo.Requests WHERE RecordId = @RecordId);
    EXEC tSQLt.AssertNotEquals @Expected = NULL, @Actual = @StageEnteredAt;
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_GetByIdReturnsRowForMember]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20));
    INSERT INTO #Actual (RecordId)
    EXEC dbo.usp_GetRequestByIdForUser @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Actual);
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_GetByIdReturnsNothingForNonMember]
AS
BEGIN
    -- Arrange — the record exists but the caller has no membership.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{}', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20));
    INSERT INTO #Actual (RecordId)
    EXEC dbo.usp_GetRequestByIdForUser @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert — zero rows: the API turns this into a 403, never disclosing existence.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #Actual);
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_PatchStaleETagThrows]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Description, Stage, FieldValues, RowVer, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'd', N'intake', N'{}', 0x0000000000000064, 0, N'seed', N'seed');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%stale ETag%';

    -- Act — pass a non-matching RowVer.
    EXEC dbo.usp_PatchRequest
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Name = N'Renamed', @Description = N'd2', @FieldValuesJson = N'{}',
        @IfMatchRowVer = 0x0000000000000001, @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_PatchMatchingETagUpdates]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Description, Stage, FieldValues, RowVer, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'd', N'intake', N'{}', 0x0000000000000064, 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_PatchRequest
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Name = N'Renamed', @Description = N'd2', @FieldValuesJson = N'{"deptPgClient":"Litigation"}',
        @IfMatchRowVer = 0x0000000000000064, @ActorUserId = N'actor';

    -- Assert
    DECLARE @Name NVARCHAR(400) = (SELECT Name FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @MirroredName NVARCHAR(400) =
        (SELECT JSON_VALUE(FieldValues, N'$.name') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Renamed', @Actual = @Name;
    EXEC tSQLt.AssertEquals @Expected = N'Renamed', @Actual = @MirroredName;
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_SetStageInvalidThrows]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '22222222-2222-4222-8222-222222222222', '1A150000-0000-4000-8000-000000000001', N'intake', N'Intake', N'Intake', 0, 0, N'seed', N'seed');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not part of the record%';

    -- Act — 'nonsense' is not a stage on the lifecycle.
    EXEC dbo.usp_SetRequestStage
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @ToStage = N'nonsense', @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_SetStageValidUpdates]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{"stage":"intake"}', 0, N'seed', N'seed');
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '22222222-2222-4222-8222-222222222222', '1A150000-0000-4000-8000-000000000001', N'execution', N'Execution', N'Execution', 2, 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_SetRequestStage
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @ToStage = N'execution', @ActorUserId = N'actor';

    -- Assert
    DECLARE @Stage NVARCHAR(64) = (SELECT Stage FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Mirror NVARCHAR(64) = (SELECT JSON_VALUE(FieldValues, N'$.stage') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'execution', @Actual = @Stage;
    EXEC tSQLt.AssertEquals @Expected = N'execution', @Actual = @Mirror;
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_SetStageResetsStageEnteredAtOnChange]
AS
BEGIN
    -- Arrange — a record parked in intake since 2020 (StageEnteredAt long in the past).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StageEnteredAt, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', '2020-01-01T00:00:00', N'{"stage":"intake"}', 0, N'seed', N'seed');
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '22222222-2222-4222-8222-222222222222', '1A150000-0000-4000-8000-000000000001', N'execution', N'Execution', N'Execution', 2, 0, N'seed', N'seed');

    -- Act — advance to a different stage.
    EXEC dbo.usp_SetRequestStage
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @ToStage = N'execution', @ActorUserId = N'actor';

    -- Assert — the clock reset: StageEnteredAt is now recent, not the 2020 seed value.
    DECLARE @Entered DATETIME2 = (SELECT StageEnteredAt FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    IF @Entered <= '2020-01-02T00:00:00'
        EXEC tSQLt.Fail @Message0 = N'StageEnteredAt should reset to now when the stage changes.';
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_SetStageSameStageKeepsStageEnteredAt]
AS
BEGIN
    -- Arrange — a record in intake since a fixed past timestamp.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, StageEnteredAt, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', '2026-01-01T00:00:00', N'{"stage":"intake"}', 0, N'seed', N'seed');
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '22222222-2222-4222-8222-222222222222', '1A150000-0000-4000-8000-000000000001', N'intake', N'Intake', N'Intake', 0, 0, N'seed', N'seed');

    -- Act — a no-op set to the SAME stage must not restart the time-in-stage clock.
    EXEC dbo.usp_SetRequestStage
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @ToStage = N'intake', @ActorUserId = N'actor';

    -- Assert
    DECLARE @Entered DATETIME2 = (SELECT StageEnteredAt FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = '2026-01-01T00:00:00', @Actual = @Entered;
END;
GO

CREATE PROCEDURE RequestsCoreTests.[test_SetHoldSetsAndClears]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{}', 0, N'seed', N'seed');

    -- Act 1 — set hold with a reason.
    EXEC dbo.usp_SetRequestHold
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Held = 1, @Reason = N'Waiting on client', @ActorUserId = N'actor';

    -- Assert 1
    DECLARE @Held NVARCHAR(5) = (SELECT JSON_VALUE(FieldValues, N'$.holdBlocked') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    DECLARE @Reason NVARCHAR(400) = (SELECT JSON_VALUE(FieldValues, N'$.holdReason') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'true', @Actual = @Held;
    EXEC tSQLt.AssertEquals @Expected = N'Waiting on client', @Actual = @Reason;

    -- Act 2 — clear hold; the reason must null out.
    EXEC dbo.usp_SetRequestHold
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Held = 0, @Reason = NULL, @ActorUserId = N'actor';

    -- Assert 2
    SET @Held = (SELECT JSON_VALUE(FieldValues, N'$.holdBlocked') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    SET @Reason = (SELECT JSON_VALUE(FieldValues, N'$.holdReason') FROM dbo.Requests WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'false', @Actual = @Held;
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = @Reason;
END;
GO
