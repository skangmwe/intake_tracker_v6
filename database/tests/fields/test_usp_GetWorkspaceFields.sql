-- =============================================
-- tSQLt tests for dbo.usp_GetWorkspaceFields (Slice 3 — Fields & objects).
-- Covers: fields returned for a (workspace, object) with the DerivedField header folded
-- in, exclusion of other object types, and soft-delete exclusion.
-- database-testing.md (AAA, FakeTable, AssertEquals).
-- =============================================

EXEC tSQLt.NewTestClass 'GetWorkspaceFieldsTests';
GO

CREATE PROCEDURE GetWorkspaceFieldsTests.[test_ReturnsFieldsForWorkspaceAndObject]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Fd UNIQUEIDENTIFIER = '11111111-1111-4111-8111-111111111111';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (@Fd, @Ws, N'Request', N'name', N'Name', N'ShortText', N'Crossing', 1, 1, 0, 0, 0, 0, 0);

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Category NVARCHAR(16),
        Section NVARCHAR(64), HelpText NVARCHAR(400), IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT,
        IsSystemProvisioned BIT, PlatformFieldKey NVARCHAR(64), Location NVARCHAR(20), VisibleStagesJson NVARCHAR(MAX), CrossingToFieldKey NVARCHAR(64),
        MinValue DECIMAL(18,4), MaxValue DECIMAL(18,4), AllowNewValues BIT, SortOrder INT, IsRetired BIT, IsLocal BIT,
        DerivedKind NVARCHAR(16), DerivedExpression NVARCHAR(1000), DerivedDefaultValue NVARCHAR(400),
        CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFields @WorkspaceId = @Ws, @ObjectType = N'Request';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'name');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldsTests.[test_FoldsDerivedHeaderIntoRow]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Fd UNIQUEIDENTIFIER = '22222222-2222-4222-8222-222222222222';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (@Fd, @Ws, N'Request', N'priorityScore', N'Priority Score', N'Calculation', 1, 0, 1, 0, 0, 0, 0);
    INSERT INTO dbo.DerivedField (FieldDefinitionId, Kind, Expression, DefaultValue, IsDeleted)
    VALUES (@Fd, N'Calculation', N'businessValue + efficiencyGain - levelOfEffort', NULL, 0);

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Category NVARCHAR(16),
        Section NVARCHAR(64), HelpText NVARCHAR(400), IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT,
        IsSystemProvisioned BIT, PlatformFieldKey NVARCHAR(64), Location NVARCHAR(20), VisibleStagesJson NVARCHAR(MAX), CrossingToFieldKey NVARCHAR(64),
        MinValue DECIMAL(18,4), MaxValue DECIMAL(18,4), AllowNewValues BIT, SortOrder INT, IsRetired BIT, IsLocal BIT,
        DerivedKind NVARCHAR(16), DerivedExpression NVARCHAR(1000), DerivedDefaultValue NVARCHAR(400),
        CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFields @WorkspaceId = @Ws, @ObjectType = N'Request';

    -- Assert
    DECLARE @Kind NVARCHAR(16) = (SELECT DerivedKind FROM #Actual WHERE FieldKey = N'priorityScore');
    EXEC tSQLt.AssertEqualsString @Expected = N'Calculation', @Actual = @Kind;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldsTests.[test_ExcludesOtherObjectTypeAndSoftDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @Ws, N'Task',    N'repoUrl', N'Repo URL', N'Url',       1, 0, 0, 0, 0, 0, 0),  -- other object type
        (NEWID(), @Ws, N'Request', N'dead',    N'Dead',     N'ShortText', 2, 0, 0, 0, 0, 0, 1); -- soft-deleted

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Category NVARCHAR(16),
        Section NVARCHAR(64), HelpText NVARCHAR(400), IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT,
        IsSystemProvisioned BIT, PlatformFieldKey NVARCHAR(64), Location NVARCHAR(20), VisibleStagesJson NVARCHAR(MAX), CrossingToFieldKey NVARCHAR(64),
        MinValue DECIMAL(18,4), MaxValue DECIMAL(18,4), AllowNewValues BIT, SortOrder INT, IsRetired BIT, IsLocal BIT,
        DerivedKind NVARCHAR(16), DerivedExpression NVARCHAR(1000), DerivedDefaultValue NVARCHAR(400),
        CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFields @WorkspaceId = @Ws, @ObjectType = N'Request';

    -- Assert — neither the Task field nor the soft-deleted Request field is returned.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldsTests.[test_IncludesGlobalsAndPrefersLocalOnKeyCollision]
AS
BEGIN
    -- Arrange — a foreign Global field surfaces here, and a local field wins over a foreign Global
    -- field of the same key (Fields tab reconciliation).
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @Ws,      N'Request', N'localOnly',    N'Local Only',    N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 1, 0, 0, 0, 0, 0, 0),
        (NEWID(), @OtherWs, N'Request', N'sharedGlobal', N'Shared Global', N'ShortText', N'WorkspaceLocal', N'Global',         2, 0, 0, 0, 0, 0, 0),
        (NEWID(), @Ws,      N'Request', N'priority',     N'Priority',      N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 3, 0, 0, 0, 0, 0, 0),
        (NEWID(), @OtherWs, N'Request', N'priority',     N'Priority (G)',  N'ShortText', N'WorkspaceLocal', N'Global',         4, 0, 0, 0, 0, 0, 0);

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Category NVARCHAR(16),
        Section NVARCHAR(64), HelpText NVARCHAR(400), IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT,
        IsSystemProvisioned BIT, PlatformFieldKey NVARCHAR(64), Location NVARCHAR(20), VisibleStagesJson NVARCHAR(MAX), CrossingToFieldKey NVARCHAR(64),
        MinValue DECIMAL(18,4), MaxValue DECIMAL(18,4), AllowNewValues BIT, SortOrder INT, IsRetired BIT, IsLocal BIT,
        DerivedKind NVARCHAR(16), DerivedExpression NVARCHAR(1000), DerivedDefaultValue NVARCHAR(400),
        CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFields @WorkspaceId = @Ws, @ObjectType = N'Request';

    -- Assert — the foreign Global surfaces as non-local; the colliding key resolves to the local row once.
    DECLARE @Shared BIT = (SELECT IsLocal FROM #Actual WHERE FieldKey = N'sharedGlobal');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Shared;

    DECLARE @PriorityCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'priority');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PriorityCount;

    DECLARE @PriorityLocal BIT = (SELECT IsLocal FROM #Actual WHERE FieldKey = N'priority');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PriorityLocal;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldsTests.[test_IncludesNullWorkspacePlatformGlobalField_AsForeignReadOnly]
AS
BEGIN
    -- Arrange — SP3b Slice 2a: a TRUE platform-owned Global field (WorkspaceId IS NULL, not just
    -- a foreign workspace's Location='Global' row). A non-owning workspace's read must still
    -- surface it, marked IsLocal = 0 (foreign/read-only).
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, IsRetired, IsDeleted)
    VALUES (NEWID(), NULL, N'Request', N'firmPolicyRef', N'Firm Policy Reference', N'ShortText', N'WorkspaceLocal', N'Global', 1, 0, 0, 0, 0, 0, 0);

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Category NVARCHAR(16),
        Section NVARCHAR(64), HelpText NVARCHAR(400), IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT,
        IsSystemProvisioned BIT, PlatformFieldKey NVARCHAR(64), Location NVARCHAR(20), VisibleStagesJson NVARCHAR(MAX), CrossingToFieldKey NVARCHAR(64),
        MinValue DECIMAL(18,4), MaxValue DECIMAL(18,4), AllowNewValues BIT, SortOrder INT, IsRetired BIT, IsLocal BIT,
        DerivedKind NVARCHAR(16), DerivedExpression NVARCHAR(1000), DerivedDefaultValue NVARCHAR(400),
        CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFields @WorkspaceId = @Ws, @ObjectType = N'Request';

    -- Assert — the NULL-workspace Global field surfaces, marked non-local.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'firmPolicyRef');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;

    DECLARE @IsLocal BIT = (SELECT IsLocal FROM #Actual WHERE FieldKey = N'firmPolicyRef');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @IsLocal;
END;
GO
