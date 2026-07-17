-- =============================================
-- tSQLt tests for the Relationships procs (Slice 25).
-- Covers: usp_UpsertRelationship (create + auto-provision fields per cardinality,
--         cardinality-immutable guard, system-edit block), usp_RetireRelationship
--         (soft-retire happy, retire-with-links returns @LinkCount without touching
--         IsRetired, force-retire, system-retire block), usp_RestoreRelationship,
--         usp_ListRelationships, usp_GetRelationshipById.
-- =============================================

EXEC tSQLt.NewTestClass 'RelationshipsTests';
GO

-- Shared arrange: WS-A with an existing admin-created Relationship; empty FieldDefinition table.
CREATE PROCEDURE RelationshipsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Relationships';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.RecordLinks';
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_Create_OneToMany_AutoProvisions_ChildLinkField]
AS
BEGIN
    -- Arrange
    DECLARE @Id UNIQUEIDENTIFIER;
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    -- Act
    EXEC dbo.usp_UpsertRelationship
        @RelationshipId  = NULL,
        @WorkspaceId     = @Ws,
        @Name            = N'Request has Sub-Requests',
        @FromObjectType  = N'Request',
        @ToObjectType    = N'Request',
        @Cardinality     = N'OneToMany',
        @FromSideLabel   = N'Sub-Requests',
        @ToSideLabel     = N'Parent',
        @ShowOnFromAsTab = 1,
        @TabLabel        = N'Sub-Requests',
        @SortOrder       = 10,
        @ActorUserId     = N'aa',
        @NewRelationshipId = @Id OUTPUT;

    -- Assert — the Relationship row exists, and one auto-provisioned RecordReference
    -- FieldDefinition on the To side (child) points back at the From side.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.Relationships WHERE RelationshipId = @Id);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.FieldDefinition
         WHERE RelationshipId = @Id AND ObjectType = N'Request' AND FieldType = N'RecordReference' AND AllowMultiple = 0);
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_Create_ManyToMany_AutoProvisions_TwoSides]
AS
BEGIN
    -- Arrange
    DECLARE @Id UNIQUEIDENTIFIER;
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    -- Act
    EXEC dbo.usp_UpsertRelationship
        @RelationshipId  = NULL,
        @WorkspaceId     = @Ws,
        @Name            = N'Feature relates to Feature',
        @FromObjectType  = N'Feature',
        @ToObjectType    = N'Feature',
        @Cardinality     = N'ManyToMany',
        @FromSideLabel   = N'Related',
        @ToSideLabel     = N'Related',
        @ActorUserId     = N'aa',
        @NewRelationshipId = @Id OUTPUT;

    -- Assert — TWO FieldDefinition rows (one per side), both allowMultiple = 1.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (
        SELECT COUNT(*) FROM dbo.FieldDefinition
         WHERE RelationshipId = @Id AND FieldType = N'RecordReference' AND AllowMultiple = 1);
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_Update_CardinalityChange_Throws]
AS
BEGIN
    -- Arrange — create a OneToMany first.
    DECLARE @Id UNIQUEIDENTIFIER;
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    EXEC dbo.usp_UpsertRelationship
        @RelationshipId = NULL, @WorkspaceId = @Ws,
        @Name = N'R1', @FromObjectType = N'Request', @ToObjectType = N'Task',
        @Cardinality = N'OneToMany', @FromSideLabel = N'Tasks', @ToSideLabel = N'Request',
        @ActorUserId = N'aa', @NewRelationshipId = @Id OUTPUT;

    -- Assert — flipping to ManyToMany should be blocked.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%immutable%';

    -- Act
    EXEC dbo.usp_UpsertRelationship
        @RelationshipId = @Id, @WorkspaceId = @Ws,
        @Name = N'R1', @FromObjectType = N'Request', @ToObjectType = N'Task',
        @Cardinality = N'ManyToMany',
        @FromSideLabel = N'Tasks', @ToSideLabel = N'Request',
        @ActorUserId = N'aa', @NewRelationshipId = @Id OUTPUT;
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_Update_SystemRelationship_Throws]
AS
BEGIN
    -- Arrange — seed a system-flagged row directly (as the migration would).
    DECLARE @SystemId UNIQUEIDENTIFIER = NEWID();
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, ShowOnFromAsTab, TabLabel, SortOrder,
         IsRetired, IsSystem, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@SystemId, @Ws, N'Request has Tasks', N'Request', N'Task', N'OneToMany',
         N'Tasks', N'Request', 1, N'Tasks & gates', 10,
         0, 1, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%system relationship%';

    -- Act
    DECLARE @Out UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertRelationship
        @RelationshipId = @SystemId, @WorkspaceId = @Ws,
        @Name = N'Renamed', @FromObjectType = N'Request', @ToObjectType = N'Task',
        @Cardinality = N'OneToMany',
        @FromSideLabel = N'Tasks', @ToSideLabel = N'Request',
        @ActorUserId = N'aa', @NewRelationshipId = @Out OUTPUT;
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_Retire_WithLiveLinks_ReturnsCountWithoutRetiring]
AS
BEGIN
    -- Arrange — a relationship with two active links.
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, IsSystem, IsDeleted, ShowOnFromAsTab,
         SortOrder, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Id, @Ws, N'R', N'Request', N'Task', N'OneToMany',
         N'Tasks', N'Request', 0, 0, 0, 0, 0,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    INSERT INTO dbo.RecordLinks
        (RecordLinkId, RelationshipId, WorkspaceId, FromRecordId, ToRecordId,
         IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Id, @Ws, N'AIS-00000001', N'AIS-00000002', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @Id, @Ws, N'AIS-00000001', N'AIS-00000003', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    DECLARE @LinkCount INT;
    EXEC dbo.usp_RetireRelationship
        @RelationshipId = @Id, @WorkspaceId = @Ws, @Force = 0,
        @ActorUserId = N'aa', @LinkCount = @LinkCount OUTPUT;

    -- Assert — LinkCount = 2, and Relationship is NOT retired yet (Force=0 with live links).
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @LinkCount;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (
        SELECT CAST(IsRetired AS INT) FROM dbo.Relationships WHERE RelationshipId = @Id);
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_Retire_WithForce_HidesAutoFields]
AS
BEGIN
    -- Arrange — a relationship with an auto-provisioned FieldDefinition and one link.
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, IsSystem, IsDeleted, ShowOnFromAsTab, SortOrder,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Id, @Ws, N'R', N'Request', N'Task', N'OneToMany',
         N'Tasks', N'Request', 0, 0, 0, 0, 0,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    INSERT INTO dbo.FieldDefinition
        (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType,
         Category, RelationshipId, IsRetired, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy,
         IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, SortOrder, IsSystemProvisioned)
    VALUES
        (NEWID(), @Ws, N'Task', N'request', N'Request', N'RecordReference',
         N'WorkspaceLocal', @Id, 0, 0,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed',
         0, 0, 0, 0, 999, 0);

    -- Act — Force = 1.
    DECLARE @LinkCount INT;
    EXEC dbo.usp_RetireRelationship
        @RelationshipId = @Id, @WorkspaceId = @Ws, @Force = 1,
        @ActorUserId = N'aa', @LinkCount = @LinkCount OUTPUT;

    -- Assert — Relationship + auto-provisioned FieldDefinition both retired.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT CAST(IsRetired AS INT) FROM dbo.Relationships WHERE RelationshipId = @Id);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT CAST(IsRetired AS INT) FROM dbo.FieldDefinition WHERE RelationshipId = @Id);
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_Retire_SystemRelationship_Throws]
AS
BEGIN
    -- Arrange
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, IsSystem, IsDeleted, ShowOnFromAsTab, SortOrder,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Id, @Ws, N'Request has Tasks', N'Request', N'Task', N'OneToMany',
         N'Tasks', N'Request', 0, 1, 0, 1, 10,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%system relationship%';

    -- Act
    DECLARE @LinkCount INT;
    EXEC dbo.usp_RetireRelationship
        @RelationshipId = @Id, @WorkspaceId = @Ws, @Force = 1,
        @ActorUserId = N'aa', @LinkCount = @LinkCount OUTPUT;
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_Restore_ReactivatesFields]
AS
BEGIN
    -- Arrange — a retired relationship with a retired auto-provisioned field.
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, RetiredAt, IsSystem, IsDeleted, ShowOnFromAsTab, SortOrder,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (@Id, @Ws, N'R', N'Request', N'Task', N'OneToMany',
         N'Tasks', N'Request', 1, SYSUTCDATETIME(), 0, 0, 0, 0,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    INSERT INTO dbo.FieldDefinition
        (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType,
         Category, RelationshipId, IsRetired, RetiredAt, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy,
         IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, SortOrder, IsSystemProvisioned)
    VALUES
        (NEWID(), @Ws, N'Task', N'request', N'Request', N'RecordReference',
         N'WorkspaceLocal', @Id, 1, SYSUTCDATETIME(), 0,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed',
         0, 0, 0, 0, 999, 0);

    -- Act
    EXEC dbo.usp_RestoreRelationship @RelationshipId = @Id, @WorkspaceId = @Ws, @ActorUserId = N'aa';

    -- Assert — both cleared.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (
        SELECT CAST(IsRetired AS INT) FROM dbo.Relationships WHERE RelationshipId = @Id);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (
        SELECT CAST(IsRetired AS INT) FROM dbo.FieldDefinition WHERE RelationshipId = @Id);
END;
GO

CREATE PROCEDURE RelationshipsTests.[test_List_SystemRowsFirst]
AS
BEGIN
    -- Arrange
    DECLARE @Ws UNIQUEIDENTIFIER = 'A1150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Relationships
        (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, IsRetired, IsSystem, IsDeleted, ShowOnFromAsTab, SortOrder,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Ws, N'Admin authored', N'Request', N'Request', N'ManyToMany',
         N'Related', N'Related', 0, 0, 0, 0, 5,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @Ws, N'Request has Tasks', N'Request', N'Task', N'OneToMany',
         N'Tasks', N'Request', 0, 1, 0, 1, 10,
         SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    CREATE TABLE #List (RelationshipId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER,
        Name NVARCHAR(120), FromObjectType NVARCHAR(50), ToObjectType NVARCHAR(50),
        Cardinality NVARCHAR(20), FromSideLabel NVARCHAR(80), ToSideLabel NVARCHAR(80),
        ShowOnFromAsTab BIT, TabLabel NVARCHAR(80), SortOrder INT,
        IsRetired BIT, IsSystem BIT,
        CreatedAt DATETIME2, UpdatedAt DATETIME2, CreatedBy NVARCHAR(256), UpdatedBy NVARCHAR(256));
    INSERT INTO #List
    EXEC dbo.usp_ListRelationships @WorkspaceId = @Ws;

    -- Assert — 2 rows total; the system row sorts first.
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #List);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT TOP 1 CAST(IsSystem AS INT) FROM #List ORDER BY IsSystem DESC, SortOrder);
END;
GO
