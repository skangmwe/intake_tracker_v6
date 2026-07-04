-- =============================================
-- tSQLt tests for dbo.usp_UpsertFieldDefinition (Slice 3 — Fields & objects).
-- Covers: insert of a new field with options, update of an existing field, replacement
-- of options on re-save, and the platform-defined-field guard (error condition).
-- =============================================

EXEC tSQLt.NewTestClass 'UpsertFieldDefinitionTests';
GO

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_InsertsNewFieldWithOptions]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    -- Act
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'severity',
        @DisplayName = N'Severity', @FieldType = N'SingleSelect', @Category = N'WorkspaceLocal',
        @OptionsJson = N'[{"value":"Low","label":"Low","sortOrder":1},{"value":"High","label":"High","sortOrder":2}]',
        @ActorUserId = N'test-actor';

    -- Assert
    DECLARE @FieldCount INT = (SELECT COUNT(*) FROM dbo.FieldDefinition WHERE FieldKey = N'severity' AND IsDeleted = 0);
    DECLARE @OptionCount INT = (SELECT COUNT(*) FROM dbo.SelectOption WHERE IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @FieldCount;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @OptionCount;
END;
GO

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_UpdatesExistingFieldDisplayName]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (NEWID(), @Ws, N'Request', N'name', N'Name', N'ShortText', 1, 0, 0, 0, 0, 0, 0);

    -- Act
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'name',
        @DisplayName = N'Request name', @FieldType = N'ShortText', @Category = N'Crossing',
        @ActorUserId = N'test-actor';

    -- Assert
    DECLARE @Name NVARCHAR(200) = (SELECT DisplayName FROM dbo.FieldDefinition WHERE FieldKey = N'name' AND IsDeleted = 0);
    EXEC tSQLt.AssertEqualsString @Expected = N'Request name', @Actual = @Name;
    -- Still exactly one live row (updated, not duplicated).
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.FieldDefinition WHERE FieldKey = N'name' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_ReplacesOptionsOnResave]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Fd UNIQUEIDENTIFIER = '33333333-3333-4333-8333-333333333333';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (@Fd, @Ws, N'Request', N'timing', N'Timing', N'SingleSelect', 1, 0, 0, 0, 0, 0, 0);
    INSERT INTO dbo.SelectOption (SelectOptionId, FieldDefinitionId, OptionValue, OptionLabel, SortOrder, IsDeleted)
    VALUES (NEWID(), @Fd, N'Old', N'Old', 1, 0);

    -- Act
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'timing',
        @DisplayName = N'Timing', @FieldType = N'SingleSelect', @Category = N'Crossing',
        @OptionsJson = N'[{"value":"Urgent","label":"Urgent","sortOrder":1}]',
        @ActorUserId = N'test-actor';

    -- Assert — the old option is soft-deleted, the new one live.
    DECLARE @LiveCount INT = (SELECT COUNT(*) FROM dbo.SelectOption WHERE FieldDefinitionId = @Fd AND IsDeleted = 0);
    DECLARE @LiveValue NVARCHAR(200) = (SELECT OptionValue FROM dbo.SelectOption WHERE FieldDefinitionId = @Fd AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @LiveCount;
    EXEC tSQLt.AssertEqualsString @Expected = N'Urgent', @Actual = @LiveValue;
END;
GO

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_PlatformDefinedField_Throws]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (NEWID(), @Ws, N'Request', N'legacyId', N'Legacy ID', N'ShortText', 1, 0, 1, 0, 1, 0, 0);

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%platform-defined%';
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'legacyId',
        @DisplayName = N'Hacked', @FieldType = N'ShortText', @Category = N'Platform',
        @ActorUserId = N'test-actor';
END;
GO
