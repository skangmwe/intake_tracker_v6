-- =============================================
-- tSQLt tests for dbo.usp_RetireFieldDefinition (Slice 3 — Fields & objects).
-- Covers: happy-path retire, the platform-defined guard, the dependency guard, and the
-- not-found error condition.
-- =============================================

EXEC tSQLt.NewTestClass 'RetireFieldDefinitionTests';
GO

CREATE PROCEDURE RetireFieldDefinitionTests.[test_RetiresUnreferencedField]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (NEWID(), @Ws, N'Request', N'triageNotes', N'Triage Notes', N'LongText', 1, 0, 0, 0, 0, 0, 0);

    -- Act
    EXEC dbo.usp_RetireFieldDefinition @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'triageNotes', @ActorUserId = N'test-actor';

    -- Assert
    DECLARE @IsRetired BIT = (SELECT IsRetired FROM dbo.FieldDefinition WHERE FieldKey = N'triageNotes');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @IsRetired;
END;
GO

CREATE PROCEDURE RetireFieldDefinitionTests.[test_PlatformDefinedField_Throws]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (NEWID(), @Ws, N'Request', N'aiSolutionsStatus', N'AI Solutions Status', N'SingleSelect', 1, 1, 0, 1, 0, 0, 0);

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%platform-defined%';
    EXEC dbo.usp_RetireFieldDefinition @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'aiSolutionsStatus', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE RetireFieldDefinitionTests.[test_ReferencedField_Throws]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    -- businessValue is depended on by the live priorityScore field.
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @Ws, N'Request', N'businessValue',  N'Business Value',  N'Number',      1, 0, 0, 0, 0, 0, 0),
        (NEWID(), @Ws, N'Request', N'priorityScore',  N'Priority Score',  N'Calculation', 2, 0, 1, 0, 0, 0, 0);
    INSERT INTO dbo.FieldRuleDependency (FieldRuleDependencyId, WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, IsDeleted)
    VALUES (NEWID(), @Ws, N'Request', N'priorityScore', N'businessValue', 0);

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%referenced by another field%';
    EXEC dbo.usp_RetireFieldDefinition @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'businessValue', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE RetireFieldDefinitionTests.[test_UnknownField_Throws]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not found%';
    EXEC dbo.usp_RetireFieldDefinition @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'nope', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE RetireFieldDefinitionTests.[test_NullWorkspace_RetiresGlobalField]
AS
BEGIN
    -- Arrange — SP3b Slice 2a: a platform retire (@WorkspaceId = NULL) soft-retires a
    -- NULL-workspace Global field.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    EXEC tSQLt.FakeTable @TableName = 'dbo.CrossingMap';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (NEWID(), NULL, N'Request', N'firmPolicyRef', N'Firm Policy Reference', N'ShortText', N'WorkspaceLocal', N'Global', 1, 0, 0, 0, 0, 0, 0);

    -- Act
    EXEC dbo.usp_RetireFieldDefinition @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'firmPolicyRef', @ActorUserId = N'platform-admin';

    -- Assert
    DECLARE @IsRetired BIT = (SELECT IsRetired FROM dbo.FieldDefinition WHERE FieldKey = N'firmPolicyRef' AND WorkspaceId IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @IsRetired;
END;
GO

CREATE PROCEDURE RetireFieldDefinitionTests.[test_NullWorkspace_DoesNotMatchMislabelledForeignGlobalRow]
AS
BEGIN
    -- Arrange — a workspace-owned row that is MISLABELLED Location='Global' (WorkspaceId=@OtherWs,
    -- not NULL). A platform retire (@WorkspaceId = NULL) must never match/modify it — the Global
    -- arm requires WorkspaceId IS NULL, not Location alone. Since no TRUE NULL-workspace row
    -- exists for this key, the lookup finds nothing and the proc throws "not found".
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    EXEC tSQLt.FakeTable @TableName = 'dbo.CrossingMap';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';
    DECLARE @MislabelledId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (@MislabelledId, @OtherWs, N'Request', N'mislabelledRetireKey', N'Owned By B', N'ShortText', N'WorkspaceLocal', N'Global', 1, 0, 0, 0, 0, 0, 0);

    -- Act + Assert — the platform retire finds no matching row and throws.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not found%';
    EXEC dbo.usp_RetireFieldDefinition @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'mislabelledRetireKey', @ActorUserId = N'platform-admin';
END;
GO

CREATE PROCEDURE RetireFieldDefinitionTests.[test_NullWorkspace_ReferencedByAnotherGlobalField_Throws]
AS
BEGIN
    -- Arrange — SP3b Slice 2a (Task 2b fix pass): two Global fields (WorkspaceId NULL) where
    -- globalDerived's rule depends on globalBase via a live NULL-workspace FieldRuleDependency
    -- edge. Proves the dependency guard's join/WHERE are null-safe (migration 102 + the B3 fix)
    -- — without the null-safe rewrite, NULL = NULL evaluates UNKNOWN and the guard would
    -- silently never fire for a Global field, letting globalBase be retired out from under a
    -- live rule that still depends on it.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    EXEC tSQLt.FakeTable @TableName = 'dbo.CrossingMap';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), NULL, N'Request', N'globalBase',    N'Global Base',    N'Number',      N'WorkspaceLocal', N'Global', 1, 0, 0, 0, 0, 0, 0),
        (NEWID(), NULL, N'Request', N'globalDerived', N'Global Derived', N'Calculation', N'WorkspaceLocal', N'Global', 2, 0, 1, 0, 0, 0, 0);
    INSERT INTO dbo.FieldRuleDependency (FieldRuleDependencyId, WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, IsDeleted)
    VALUES (NEWID(), NULL, N'Request', N'globalDerived', N'globalBase', 0);

    -- Act + Assert — retiring globalBase (still depended on by globalDerived's live rule) must THROW.
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%referenced by another field%';
    EXEC dbo.usp_RetireFieldDefinition @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'globalBase', @ActorUserId = N'platform-admin';
END;
GO

CREATE PROCEDURE RetireFieldDefinitionTests.[test_FieldInLiveCrossingMapping_Throws]
AS
BEGIN
    -- Arrange — a field used by a live (confirmed) crossing mapping cannot be retired (slice 24 guard).
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    EXEC tSQLt.FakeTable @TableName = 'dbo.CrossingMap';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @FieldId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (@FieldId, @Ws, N'Request', N'clientName', N'Client Name', N'ShortText', 0, 0, 0, 0, 0, 0, 0);
    INSERT INTO dbo.CrossingMap (CrossingMapId, PgFieldDefinitionId, AiFieldDefinitionId, Status, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @FieldId, NEWID(), N'Confirmed', 0, N'seed', N'seed');

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%crossing-map mapping%';
    EXEC dbo.usp_RetireFieldDefinition @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'clientName', @ActorUserId = N'test-actor';
END;
GO
