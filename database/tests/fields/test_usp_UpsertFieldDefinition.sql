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

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_NullWorkspace_WithConditionalRule_PersistsDependencyRowWithNullWorkspace]
AS
BEGIN
    -- Arrange — SP3b Slice 2a (Task 2 fix pass): dbo.FieldRuleDependency.WorkspaceId is now
    -- nullable (migration 102). A Global field (@WorkspaceId = NULL) carrying a non-empty
    -- @DependenciesJson must upsert successfully — not fail the INSERT — and its dependency edge
    -- must persist with WorkspaceId IS NULL (the same namespace as the field itself).
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';

    -- The field this one will depend on (the referenced key need not pre-exist as a row for this
    -- proc — the acyclic/depth check runs upstream in the API's ConditionEngine).
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'globalBase',
        @DisplayName = N'Global Base', @FieldType = N'Number', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'platform-admin';

    -- Act — a second Global field with a rule that depends on globalBase.
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'globalDerived',
        @DisplayName = N'Global Derived', @FieldType = N'Number', @Category = N'WorkspaceLocal',
        @Location = N'Global',
        @RulesJson = N'[{"action":"require","whenFieldKey":"globalBase","comparator":"gt","compareValue":"0","produceValue":null,"sortOrder":1}]',
        @DependenciesJson = N'["globalBase"]',
        @ActorUserId = N'platform-admin';

    -- Assert — the field itself persisted (proves the INSERT into FieldRuleDependency did not
    -- roll back the whole transaction), and the dependency edge is live with WorkspaceId IS NULL.
    DECLARE @FieldCount INT = (SELECT COUNT(*) FROM dbo.FieldDefinition WHERE FieldKey = N'globalDerived' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @FieldCount;

    DECLARE @DepCount INT = (
        SELECT COUNT(*) FROM dbo.FieldRuleDependency
        WHERE FromFieldKey = N'globalDerived' AND ToFieldKey = N'globalBase'
          AND WorkspaceId IS NULL AND ObjectType = N'Request' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @DepCount;
END;
GO

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_NullWorkspace_ResaveWithConditionalRule_RetiresPriorGlobalDependencyEdge]
AS
BEGIN
    -- Arrange — a Global field's dependency edges must be soft-deleted-then-reinserted on
    -- re-save, same as a workspace field's. Without the WorkspaceId IS NULL match added to the
    -- soft-delete predicate, the FIRST save's edge would never be superseded (NULL = NULL is
    -- UNKNOWN) and would remain live alongside the second — an accumulating duplicate.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';

    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'globalDerived2',
        @DisplayName = N'Global Derived 2', @FieldType = N'Number', @Category = N'WorkspaceLocal',
        @Location = N'Global',
        @DependenciesJson = N'["globalOldDep"]',
        @ActorUserId = N'platform-admin';

    -- Act — re-save with a DIFFERENT dependency.
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'globalDerived2',
        @DisplayName = N'Global Derived 2', @FieldType = N'Number', @Category = N'WorkspaceLocal',
        @Location = N'Global',
        @DependenciesJson = N'["globalNewDep"]',
        @ActorUserId = N'platform-admin';

    -- Assert — exactly one LIVE edge (the new one); the old edge was soft-deleted, not left live.
    DECLARE @LiveCount INT = (
        SELECT COUNT(*) FROM dbo.FieldRuleDependency
        WHERE FromFieldKey = N'globalDerived2' AND WorkspaceId IS NULL AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @LiveCount;

    DECLARE @LiveTarget NVARCHAR(64) = (
        SELECT ToFieldKey FROM dbo.FieldRuleDependency
        WHERE FromFieldKey = N'globalDerived2' AND WorkspaceId IS NULL AND IsDeleted = 0);
    EXEC tSQLt.AssertEqualsString @Expected = N'globalNewDep', @Actual = @LiveTarget;
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

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_NullWorkspace_DoesNotMatchMislabelledForeignGlobalRow]
AS
BEGIN
    -- Arrange — a workspace-owned row that is MISLABELLED Location='Global' (WorkspaceId=@OtherWs,
    -- not NULL — FieldDefinition places no server-side constraint tying Location to WorkspaceId).
    -- A platform call (@WorkspaceId = NULL) must never match/patch it — the Global arm requires
    -- WorkspaceId IS NULL, not Location alone.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';
    DECLARE @MislabelledId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (@MislabelledId, @OtherWs, N'Request', N'mislabelledKey', N'Owned By B', N'ShortText', N'WorkspaceLocal', N'Global', 1, 0, 0, 0, 0, 0, 0);

    -- Act — a platform upsert of the SAME key.
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'mislabelledKey',
        @DisplayName = N'Platform Copy', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'platform-admin';

    -- Assert — B's mislabelled row is untouched (not patched to 'Platform Copy'), AND a SEPARATE
    -- NULL-workspace row was created rather than the lookup matching B's row.
    DECLARE @BStillOwns NVARCHAR(200) = (SELECT DisplayName FROM dbo.FieldDefinition WHERE FieldDefinitionId = @MislabelledId);
    EXEC tSQLt.AssertEqualsString @Expected = N'Owned By B', @Actual = @BStillOwns;

    DECLARE @PlatformRowCount INT = (
        SELECT COUNT(*) FROM dbo.FieldDefinition
        WHERE FieldKey = N'mislabelledKey' AND WorkspaceId IS NULL AND DisplayName = N'Platform Copy' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PlatformRowCount;

    DECLARE @TotalRowCount INT = (SELECT COUNT(*) FROM dbo.FieldDefinition WHERE FieldKey = N'mislabelledKey' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @TotalRowCount;
END;
GO

CREATE PROCEDURE UpsertFieldDefinitionTests.[test_NullWorkspace_ExecTwice_SameKey_UpdatesRatherThanDuplicates]
AS
BEGIN
    -- Arrange — a second EXEC of usp_UpsertFieldDefinition with the SAME Global key must UPDATE
    -- the existing row (the proc's own lookup-then-branch finds it), not create a duplicate.
    -- Complements test_NullWorkspace_DuplicateGlobalKey_Throws, which proves the schema-level
    -- guard via a raw INSERT bypassing the proc's own lookup.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';

    -- Act — create, then re-save with a changed DisplayName.
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'reexecTest',
        @DisplayName = N'First Save', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'platform-admin';
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = N'Request', @FieldKey = N'reexecTest',
        @DisplayName = N'Second Save', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'platform-admin';

    -- Assert — exactly one live row, updated in place.
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.FieldDefinition WHERE FieldKey = N'reexecTest' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;

    DECLARE @Name NVARCHAR(200) = (SELECT DisplayName FROM dbo.FieldDefinition WHERE FieldKey = N'reexecTest' AND IsDeleted = 0);
    EXEC tSQLt.AssertEqualsString @Expected = N'Second Save', @Actual = @Name;
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
