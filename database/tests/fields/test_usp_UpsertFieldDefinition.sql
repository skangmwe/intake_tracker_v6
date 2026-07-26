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

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_PersistsLocationOnInsert]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    -- Act — create a Global-scoped field (Fields tab reconciliation).
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'sharedPriority',
        @DisplayName = N'Shared Priority', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'test-actor';

    -- Assert
    DECLARE @Location NVARCHAR(20) = (SELECT Location FROM dbo.FieldDefinition WHERE FieldKey = N'sharedPriority' AND IsDeleted = 0);
    EXEC tSQLt.AssertEqualsString @Expected = N'Global', @Actual = @Location;
END;
GO

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_NullWorkspace_CreatesGlobalField]
AS
BEGIN
    -- Arrange — SP3b Slice 2a: a platform create (@WorkspaceId = NULL) makes a NULL-workspace
    -- Global field.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';

    -- Act
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'firmPolicyRef',
        @DisplayName = N'Firm Policy Reference', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'platform-admin';

    -- Assert — the row is NULL-workspace and Global.
    DECLARE @Count INT = (
        SELECT COUNT(*) FROM dbo.FieldDefinition
        WHERE FieldKey = N'firmPolicyRef' AND ObjectType = N'Request'
          AND WorkspaceId IS NULL AND Location = N'Global' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_NullWorkspace_DuplicateGlobalKey_Throws]
AS
BEGIN
    -- Arrange — the Global namespace enforces key uniqueness per (ObjectType, FieldKey) via the
    -- pre-existing filtered unique index UX_FieldDefinition_Global_Object_Key (migration 072). A
    -- second create of the same Global key throws at the index.
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    -- FieldDefinition is NOT faked here — the real table (with its real indexes) is required so the
    -- Global-namespace unique index actually enforces the duplicate-key guard under test.

    -- Act — create the first Global field.
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Feature', @FieldKey = N'globalDupTest',
        @DisplayName = N'Global Dup Test', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'platform-admin';

    -- Assert — a second, INDEPENDENT create of the same Global key is rejected by the unique index.
    -- (usp_UpsertFieldDefinition's own lookup only matches by natural key + Location, so a caller
    -- that fabricates a fresh @FieldDefinitionId path can't bypass it — the index is authoritative.)
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%UX_FieldDefinition_Global_Object_Key%';
    INSERT INTO dbo.FieldDefinition
        (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location,
         IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted, SortOrder,
         CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
    VALUES
        (NEWID(), NULL, N'Feature', N'globalDupTest', N'Duplicate', N'ShortText', N'WorkspaceLocal', N'Global',
         0, 0, 0, 0, 0, 0, 1, N'test-actor', N'test-actor', SYSUTCDATETIME(), SYSUTCDATETIME());
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
