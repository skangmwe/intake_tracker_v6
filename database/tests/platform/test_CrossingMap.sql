-- =============================================
-- tSQLt tests for the S35 admin-editable crossing map (Slice 24):
--   usp_ProposeCrossingMap (happy + type-mismatch + derived-reject + already-mapped + wrong-direction),
--   usp_ConfirmCrossingMap (happy + not-proposable), usp_GetCrossingMap (unions durable rows).
-- =============================================

EXEC tSQLt.NewTestClass 'CrossingMapTests';
GO

CREATE PROCEDURE CrossingMapTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.CrossingMap';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-0000000000A1', N'PG Template', N'pg-dept-template', N'TMPL', 0, 0),
           ('1A150000-0000-4000-8000-0000000000A2', N'AI Solutions', N'ai-solutions',     N'AIS',  0, 0);
END;
GO

-- Helper: insert a Request field on a workspace. Called from the Arrange of each test.
CREATE PROCEDURE CrossingMapTests.[InsertField]
    @Id UNIQUEIDENTIFIER, @Ws UNIQUEIDENTIFIER, @Key NVARCHAR(64), @Type NVARCHAR(32), @Platform BIT = 0
AS
BEGIN
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Id, @Ws, N'Request', @Key, @Key, @Type, N'WorkspaceLocal', 0, 0, 0, @Platform, 0, 0, 0, N'seed', N'seed');
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_Propose_CreatesProposedMapping]
AS
BEGIN
    -- Arrange
    DECLARE @Pg UNIQUEIDENTIFIER = NEWID(), @Ai UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.InsertField @Pg, '1A150000-0000-4000-8000-0000000000A1', N'pgClient', N'ShortText';
    EXEC CrossingMapTests.InsertField @Ai, '1A150000-0000-4000-8000-0000000000A2', N'aiClient', N'ShortText';

    -- Act
    CREATE TABLE #Row (CrossingMapId UNIQUEIDENTIFIER, SourceFieldKey NVARCHAR(64), SourceDisplayName NVARCHAR(200),
        SourceFieldType NVARCHAR(32), TargetFieldKey NVARCHAR(64), TargetDisplayName NVARCHAR(200), TargetFieldType NVARCHAR(32),
        Status NVARCHAR(16), OptionCorrespondenceJson NVARCHAR(MAX), ConfirmedByUserId NVARCHAR(256), ConfirmedAt DATETIME2);
    INSERT INTO #Row EXEC dbo.usp_ProposeCrossingMap @PgFieldDefinitionId = @Pg, @AiFieldDefinitionId = @Ai, @ActorUserId = N'actor';

    -- Assert — one Proposed row, resolved to the two field keys
    DECLARE @Status NVARCHAR(16) = (SELECT Status FROM #Row);
    EXEC tSQLt.AssertEqualsString @Expected = N'Proposed', @Actual = @Status;
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.CrossingMap WHERE PgFieldDefinitionId = @Pg AND AiFieldDefinitionId = @Ai AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_Propose_TypeMismatch_Throws]
AS
BEGIN
    DECLARE @Pg UNIQUEIDENTIFIER = NEWID(), @Ai UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.InsertField @Pg, '1A150000-0000-4000-8000-0000000000A1', N'pgNum', N'Number';
    EXEC CrossingMapTests.InsertField @Ai, '1A150000-0000-4000-8000-0000000000A2', N'aiText', N'ShortText';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%same type%';
    EXEC dbo.usp_ProposeCrossingMap @PgFieldDefinitionId = @Pg, @AiFieldDefinitionId = @Ai, @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_Propose_DerivedField_Throws]
AS
BEGIN
    DECLARE @Pg UNIQUEIDENTIFIER = NEWID(), @Ai UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.InsertField @Pg, '1A150000-0000-4000-8000-0000000000A1', N'pgCalc', N'Calculation';
    EXEC CrossingMapTests.InsertField @Ai, '1A150000-0000-4000-8000-0000000000A2', N'aiCalc', N'Calculation';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%Derived and platform-defined%';
    EXEC dbo.usp_ProposeCrossingMap @PgFieldDefinitionId = @Pg, @AiFieldDefinitionId = @Ai, @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_Propose_WrongDirection_Throws]
AS
BEGIN
    -- Both fields on the AI side — no PG source, so the direction guard fires.
    DECLARE @A1 UNIQUEIDENTIFIER = NEWID(), @A2 UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.InsertField @A1, '1A150000-0000-4000-8000-0000000000A2', N'aiOne', N'ShortText';
    EXEC CrossingMapTests.InsertField @A2, '1A150000-0000-4000-8000-0000000000A2', N'aiTwo', N'ShortText';

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%PG/Dept field to an AI Solutions field%';
    EXEC dbo.usp_ProposeCrossingMap @PgFieldDefinitionId = @A1, @AiFieldDefinitionId = @A2, @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_Propose_AlreadyMapped_Throws]
AS
BEGIN
    DECLARE @Pg UNIQUEIDENTIFIER = NEWID(), @Ai UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.InsertField @Pg, '1A150000-0000-4000-8000-0000000000A1', N'pgClient', N'ShortText';
    EXEC CrossingMapTests.InsertField @Ai, '1A150000-0000-4000-8000-0000000000A2', N'aiClient', N'ShortText';
    -- An existing live mapping already uses the PG field.
    INSERT INTO dbo.CrossingMap (CrossingMapId, PgFieldDefinitionId, AiFieldDefinitionId, Status, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Pg, NEWID(), N'Confirmed', 0, N'seed', N'seed');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%already mapped%';
    EXEC dbo.usp_ProposeCrossingMap @PgFieldDefinitionId = @Pg, @AiFieldDefinitionId = @Ai, @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_Confirm_MovesToConfirmed]
AS
BEGIN
    -- Arrange — a proposed mapping over two live fields.
    DECLARE @Pg UNIQUEIDENTIFIER = NEWID(), @Ai UNIQUEIDENTIFIER = NEWID(), @Map UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.InsertField @Pg, '1A150000-0000-4000-8000-0000000000A1', N'pgClient', N'ShortText';
    EXEC CrossingMapTests.InsertField @Ai, '1A150000-0000-4000-8000-0000000000A2', N'aiClient', N'ShortText';
    INSERT INTO dbo.CrossingMap (CrossingMapId, PgFieldDefinitionId, AiFieldDefinitionId, Status, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Map, @Pg, @Ai, N'Proposed', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Row (CrossingMapId UNIQUEIDENTIFIER, SourceFieldKey NVARCHAR(64), SourceDisplayName NVARCHAR(200),
        SourceFieldType NVARCHAR(32), TargetFieldKey NVARCHAR(64), TargetDisplayName NVARCHAR(200), TargetFieldType NVARCHAR(32),
        Status NVARCHAR(16), OptionCorrespondenceJson NVARCHAR(MAX), ConfirmedByUserId NVARCHAR(256), ConfirmedAt DATETIME2);
    INSERT INTO #Row EXEC dbo.usp_ConfirmCrossingMap @CrossingMapId = @Map, @ActorUserId = N'confirmer';

    -- Assert
    DECLARE @Status NVARCHAR(16) = (SELECT Status FROM dbo.CrossingMap WHERE CrossingMapId = @Map);
    EXEC tSQLt.AssertEqualsString @Expected = N'Confirmed', @Actual = @Status;
    DECLARE @By NVARCHAR(256) = (SELECT ConfirmedByUserId FROM dbo.CrossingMap WHERE CrossingMapId = @Map);
    EXEC tSQLt.AssertEqualsString @Expected = N'confirmer', @Actual = @By;
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_Confirm_NotProposed_Throws]
AS
BEGIN
    -- A confirmed mapping cannot be confirmed again.
    DECLARE @Map UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.CrossingMap (CrossingMapId, PgFieldDefinitionId, AiFieldDefinitionId, Status, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Map, NEWID(), NEWID(), N'Confirmed', 0, N'seed', N'seed');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not awaiting confirmation%';
    EXEC dbo.usp_ConfirmCrossingMap @CrossingMapId = @Map, @ActorUserId = N'confirmer';
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_GetCrossingMap_IncludesDurableRow]
AS
BEGIN
    -- Arrange — one durable confirmed mapping (no seeded crossing fields set up).
    DECLARE @Pg UNIQUEIDENTIFIER = NEWID(), @Ai UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.InsertField @Pg, '1A150000-0000-4000-8000-0000000000A1', N'pgClient', N'ShortText';
    EXEC CrossingMapTests.InsertField @Ai, '1A150000-0000-4000-8000-0000000000A2', N'aiClient', N'ShortText';
    INSERT INTO dbo.CrossingMap (CrossingMapId, PgFieldDefinitionId, AiFieldDefinitionId, Status, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Pg, @Ai, N'Confirmed', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Map (CrossingMapId UNIQUEIDENTIFIER, SourceFieldKey NVARCHAR(64), SourceDisplayName NVARCHAR(200),
        SourceFieldType NVARCHAR(32), TargetFieldKey NVARCHAR(64), TargetDisplayName NVARCHAR(200), TargetFieldType NVARCHAR(32),
        Status NVARCHAR(16), OptionCorrespondenceJson NVARCHAR(MAX), ConfirmedByUserId NVARCHAR(256), ConfirmedAt DATETIME2);
    INSERT INTO #Map EXEC dbo.usp_GetCrossingMap;

    -- Assert — the durable confirmed pair is present
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Map WHERE SourceFieldKey = N'pgClient' AND TargetFieldKey = N'aiClient' AND Status = N'Confirmed');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO
