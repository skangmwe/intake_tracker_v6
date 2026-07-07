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
