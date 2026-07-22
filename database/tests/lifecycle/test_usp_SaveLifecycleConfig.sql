-- =============================================
-- tSQLt tests for dbo.usp_SaveLifecycleConfig (Slice 4 — Lifecycle & gates).
-- Covers: insert of a new lifecycle with stages + gates + slots, retirement of a gate
-- dropped from the payload, the one-default guard, and the foreign-stage guard.
-- =============================================

EXEC tSQLt.NewTestClass 'SaveLifecycleConfigTests';
GO

CREATE PROCEDURE SaveLifecycleConfigTests.[test_InsertsNewLifecycleWithStagesGatesSlots]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Lifecycle';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateApproverSlot';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Json NVARCHAR(MAX) = N'[
        { "name": "Standard delivery", "requestType": "Full build", "isDefault": true, "sortOrder": 0,
          "stages": [
            { "key": "execution", "label": "Execution", "statusCategory": "Execution", "sortOrder": 0 },
            { "key": "validation", "label": "Validation", "statusCategory": "Validation", "sortOrder": 1 } ],
          "gates": [
            { "name": "Validation readiness gate", "fromStageKey": "execution", "toStageKey": "validation", "sortOrder": 0,
              "slots": [ { "roleLabel": "InfoSec" }, { "roleLabel": "AI Solutions Manager" } ] } ] } ]';

    -- Act
    EXEC dbo.usp_SaveLifecycleConfig @WorkspaceId = @Ws, @LifecyclesJson = @Json, @ActorUserId = N'test-actor';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Lifecycle WHERE IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Lifecycle WHERE IsDefault = 1 AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM dbo.StageDefinition WHERE IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.GateDefinition WHERE IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM dbo.GateApproverSlot WHERE IsDeleted = 0);
    -- The gate's stage FKs resolved to real stage ids.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM dbo.GateDefinition WHERE FromStageId IS NULL OR ToStageId IS NULL);
END;
GO

CREATE PROCEDURE SaveLifecycleConfigTests.[test_RetiresGateDroppedFromPayload]
AS
BEGIN
    -- Arrange: an existing lifecycle with two stages and two gates.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Lifecycle';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateApproverSlot';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = '11FE0000-0000-4000-8000-000000000001';
    DECLARE @SBuild UNIQUEIDENTIFIER = '57A60000-0000-4000-8000-000000000003';
    DECLARE @SQa UNIQUEIDENTIFIER = '57A60000-0000-4000-8000-000000000004';
    DECLARE @GKeep UNIQUEIDENTIFIER = '6A7E0000-0000-4000-8000-000000000001';
    DECLARE @GDrop UNIQUEIDENTIFIER = '6A7E0000-0000-4000-8000-000000000002';

    INSERT INTO dbo.Lifecycle (LifecycleId, WorkspaceId, Name, RequestType, IsDefault, SortOrder, IsDeleted)
    VALUES (@Lc, @Ws, N'Standard', N'Full build', 1, 0, 0);
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, IsDeleted)
    VALUES (@SBuild, @Lc, @Ws, N'execution', N'Execution', N'Execution', 0, 0), (@SQa, @Lc, @Ws, N'validation', N'Validation', N'Validation', 1, 0);
    INSERT INTO dbo.GateDefinition (GateDefinitionId, LifecycleId, WorkspaceId, Name, FromStageId, ToStageId, JoinKind, SortOrder, IsDeleted)
    VALUES (@GKeep, @Lc, @Ws, N'Keep gate', @SBuild, @SQa, N'and', 0, 0),
           (@GDrop, @Lc, @Ws, N'Drop gate', @SBuild, @SQa, N'and', 1, 0);

    DECLARE @Json NVARCHAR(MAX) = N'[
        { "id": "11FE0000-0000-4000-8000-000000000001", "name": "Standard", "requestType": "Full build", "isDefault": true, "sortOrder": 0,
          "stages": [
            { "id": "57A60000-0000-4000-8000-000000000003", "key": "execution", "label": "Execution", "statusCategory": "Execution", "sortOrder": 0 },
            { "id": "57A60000-0000-4000-8000-000000000004", "key": "validation", "label": "Validation", "statusCategory": "Validation", "sortOrder": 1 } ],
          "gates": [
            { "id": "6A7E0000-0000-4000-8000-000000000001", "name": "Keep gate", "fromStageKey": "execution", "toStageKey": "validation", "sortOrder": 0, "slots": [] } ] } ]';

    -- Act
    EXEC dbo.usp_SaveLifecycleConfig @WorkspaceId = @Ws, @LifecyclesJson = @Json, @ActorUserId = N'test-actor';

    -- Assert — the dropped gate is retired, the kept gate stays live.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT IsDeleted FROM dbo.GateDefinition WHERE GateDefinitionId = @GDrop);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT IsDeleted FROM dbo.GateDefinition WHERE GateDefinitionId = @GKeep);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.GateDefinition WHERE IsDeleted = 0);
END;
GO

CREATE PROCEDURE SaveLifecycleConfigTests.[test_RejectsMultipleDefaults]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Lifecycle';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateApproverSlot';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Json NVARCHAR(MAX) = N'[
        { "name": "A", "requestType": "T1", "isDefault": true, "sortOrder": 0, "stages": [], "gates": [] },
        { "name": "B", "requestType": "T2", "isDefault": true, "sortOrder": 1, "stages": [], "gates": [] } ]';

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%exactly one%';
    EXEC dbo.usp_SaveLifecycleConfig @WorkspaceId = @Ws, @LifecyclesJson = @Json, @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE SaveLifecycleConfigTests.[test_RejectsGateReferencingForeignStage]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Lifecycle';
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.GateApproverSlot';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Json NVARCHAR(MAX) = N'[
        { "name": "A", "requestType": "T1", "isDefault": true, "sortOrder": 0,
          "stages": [ { "key": "execution", "label": "Execution", "statusCategory": "Execution", "sortOrder": 0 } ],
          "gates": [ { "name": "Bad gate", "fromStageKey": "execution", "toStageKey": "nope", "sortOrder": 0, "slots": [] } ] } ]';

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not part of its lifecycle%';
    EXEC dbo.usp_SaveLifecycleConfig @WorkspaceId = @Ws, @LifecyclesJson = @Json, @ActorUserId = N'test-actor';
END;
GO
