-- =============================================
-- tSQLt tests for the RecordLinks procs (Slice 25).
-- Covers: usp_UpsertRecordLink (happy path, idempotency on repeat, OneToOne guard,
--         retired-relationship guard), usp_DeleteRecordLink (soft-delete + idempotency),
--         usp_ListRecordLinks (Out + In directions, filter by RelationshipId).
-- =============================================

EXEC tSQLt.NewTestClass 'RecordLinksTests';
GO

CREATE PROCEDURE RecordLinksTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Relationships';
    EXEC tSQLt.FakeTable @TableName = 'dbo.RecordLinks';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
END;
GO

CREATE PROCEDURE RecordLinksTests.[test_Upsert_HappyPath_InsertsLink]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';
    DECLARE @Rel UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, IsSystem, IsDeleted, ShowOnFromAsTab, SortOrder,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Rel, @Ws, N'R', N'Request', N'Task', N'OneToMany', N'Tasks', N'Request',
         0, 0, 0, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    DECLARE @LinkId UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertRecordLink
        @RelationshipId = @Rel, @WorkspaceId = @Ws,
        @FromRecordId = N'AIS-00000001', @ToRecordId = N'AIS-00000002',
        @ActorUserId = N'aa', @RecordLinkId = @LinkId OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.RecordLinks WHERE RelationshipId = @Rel AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE RecordLinksTests.[test_Upsert_IsIdempotent_OnRepeat]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';
    DECLARE @Rel UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, IsSystem, IsDeleted, ShowOnFromAsTab, SortOrder,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Rel, @Ws, N'R', N'Request', N'Task', N'ManyToMany', N'Related', N'Related',
         0, 0, 0, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    DECLARE @First UNIQUEIDENTIFIER, @Second UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertRecordLink
        @RelationshipId = @Rel, @WorkspaceId = @Ws,
        @FromRecordId = N'AIS-1', @ToRecordId = N'AIS-2',
        @ActorUserId = N'aa', @RecordLinkId = @First OUTPUT;

    -- Act — second call with same triple.
    EXEC dbo.usp_UpsertRecordLink
        @RelationshipId = @Rel, @WorkspaceId = @Ws,
        @FromRecordId = N'AIS-1', @ToRecordId = N'AIS-2',
        @ActorUserId = N'aa', @RecordLinkId = @Second OUTPUT;

    -- Assert — same LinkId, no duplicate row.
    EXEC tSQLt.AssertEqualsString @Expected = 'match', @Actual = CASE WHEN @First = @Second THEN 'match' ELSE 'diff' END;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.RecordLinks WHERE RelationshipId = @Rel);
END;
GO

CREATE PROCEDURE RecordLinksTests.[test_Upsert_OneToOne_SecondLinkFromSameRecord_Throws]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';
    DECLARE @Rel UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, IsSystem, IsDeleted, ShowOnFromAsTab, SortOrder,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Rel, @Ws, N'R', N'Request', N'Feature', N'OneToOne', N'Feature', N'Origin request',
         0, 0, 0, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    DECLARE @LinkId UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertRecordLink
        @RelationshipId = @Rel, @WorkspaceId = @Ws,
        @FromRecordId = N'AIS-1', @ToRecordId = N'AIS-2',
        @ActorUserId = N'aa', @RecordLinkId = @LinkId OUTPUT;

    -- Assert — a second link from AIS-1 (any different target) is a cardinality violation.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%OneToOne%';

    -- Act
    EXEC dbo.usp_UpsertRecordLink
        @RelationshipId = @Rel, @WorkspaceId = @Ws,
        @FromRecordId = N'AIS-1', @ToRecordId = N'AIS-3',
        @ActorUserId = N'aa', @RecordLinkId = @LinkId OUTPUT;
END;
GO

CREATE PROCEDURE RecordLinksTests.[test_Upsert_RetiredRelationship_Throws]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';
    DECLARE @Rel UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, IsSystem, IsDeleted, ShowOnFromAsTab, SortOrder,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Rel, @Ws, N'R', N'Request', N'Task', N'OneToMany', N'Tasks', N'Request',
         1, 0, 0, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%retired%';

    -- Act
    DECLARE @LinkId UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertRecordLink
        @RelationshipId = @Rel, @WorkspaceId = @Ws,
        @FromRecordId = N'AIS-1', @ToRecordId = N'AIS-2',
        @ActorUserId = N'aa', @RecordLinkId = @LinkId OUTPUT;
END;
GO

CREATE PROCEDURE RecordLinksTests.[test_Delete_IsIdempotent]
AS
BEGIN
    -- Arrange
    DECLARE @Ws  UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';
    DECLARE @Id  UNIQUEIDENTIFIER = NEWID();

    INSERT INTO dbo.RecordLinks
        (RecordLinkId, RelationshipId, WorkspaceId, FromRecordId, ToRecordId,
         IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Id, NEWID(), @Ws, N'AIS-1', N'AIS-2',
         0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act — call delete twice.
    EXEC dbo.usp_DeleteRecordLink @RecordLinkId = @Id, @WorkspaceId = @Ws, @ActorUserId = N'aa';
    EXEC dbo.usp_DeleteRecordLink @RecordLinkId = @Id, @WorkspaceId = @Ws, @ActorUserId = N'aa';

    -- Assert — row soft-deleted (IsDeleted = 1). Idempotent second call is a no-op, no exception.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT CAST(IsDeleted AS INT) FROM dbo.RecordLinks WHERE RecordLinkId = @Id);
END;
GO

CREATE PROCEDURE RecordLinksTests.[test_List_ReturnsBothDirections]
AS
BEGIN
    -- Arrange — two rows: one where the record is FROM, one where it's TO.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';
    DECLARE @Rel UNIQUEIDENTIFIER = NEWID();

    INSERT INTO dbo.RecordLinks
        (RecordLinkId, RelationshipId, WorkspaceId, FromRecordId, ToRecordId,
         IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Rel, @Ws, N'AIS-00000001', N'AIS-00000002', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @Rel, @Ws, N'AIS-00000003', N'AIS-00000001', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act — list all links touching AIS-00000001.
    CREATE TABLE #Links (Id UNIQUEIDENTIFIER, RelationshipId UNIQUEIDENTIFIER,
        FromRecordId NVARCHAR(20), ToRecordId NVARCHAR(20),
        ToRecordDisplayName NVARCHAR(400), ToRecordStage NVARCHAR(64),
        Direction NVARCHAR(3), CreatedAt DATETIME2, CreatedBy NVARCHAR(256));
    INSERT INTO #Links
    EXEC dbo.usp_ListRecordLinks
        @WorkspaceId = @Ws, @RecordId = N'AIS-00000001', @RelationshipId = NULL;

    -- Assert — 2 rows, one Out and one In.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #Links);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Links WHERE Direction = N'Out');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Links WHERE Direction = N'In');
END;
GO
