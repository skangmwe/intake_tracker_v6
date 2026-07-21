-- =============================================
-- tSQLt tests for dbo.usp_GetWorkspaceFieldCatalog (Fields tab reconciliation).
-- Covers: the flat, all-object-types read returns the workspace's own fields plus every Global
-- field, flags locality, prefers a local field over a foreign-global on a key collision, and
-- excludes soft-deleted rows. database-testing.md (AAA, FakeTable, AssertEquals).
-- =============================================

EXEC tSQLt.NewTestClass 'GetWorkspaceFieldCatalogTests';
GO

CREATE PROCEDURE GetWorkspaceFieldCatalogTests.[test_ReturnsLocalAndGlobalAcrossObjects]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, IsSystemProvisioned, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @Ws,      N'Request', N'localReq',  N'Local Req',  N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 1, 0, 0, 0, 0, 0, 0, 0),
        (NEWID(), @Ws,      N'Task',    N'localTask', N'Local Task', N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 2, 0, 0, 0, 0, 0, 0, 0),
        (NEWID(), @OtherWs, N'Request', N'globalReq', N'Global Req', N'ShortText', N'WorkspaceLocal', N'Global',         3, 0, 0, 0, 0, 0, 0, 0),
        (NEWID(), @OtherWs, N'Request', N'foreignLocal', N'Foreign',  N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 4, 0, 0, 0, 0, 0, 0, 0); -- another ws's local — excluded

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Location NVARCHAR(20),
        IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT, IsSystemProvisioned BIT, IsRetired BIT, IsLocal BIT);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFieldCatalog @WorkspaceId = @Ws;

    -- Assert — the two local fields and the one Global field are returned; the other ws's local is not.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Total;

    DECLARE @GlobalLocal BIT = (SELECT IsLocal FROM #Actual WHERE FieldKey = N'globalReq');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @GlobalLocal;

    DECLARE @ForeignCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'foreignLocal');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ForeignCount;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldCatalogTests.[test_PrefersLocalOverGlobalOnKeyCollisionAndExcludesDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, IsSystemProvisioned, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @Ws,      N'Request', N'priority', N'Priority',     N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 1, 0, 0, 0, 0, 0, 0, 0),
        (NEWID(), @OtherWs, N'Request', N'priority', N'Priority (G)', N'ShortText', N'WorkspaceLocal', N'Global',         2, 0, 0, 0, 0, 0, 0, 0),
        (NEWID(), @Ws,      N'Request', N'dead',     N'Dead',         N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 3, 0, 0, 0, 0, 0, 0, 1); -- soft-deleted

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Location NVARCHAR(20),
        IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT, IsSystemProvisioned BIT, IsRetired BIT, IsLocal BIT);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFieldCatalog @WorkspaceId = @Ws;

    -- Assert — the colliding key resolves once to the local row; the soft-deleted row is gone.
    DECLARE @PriorityCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'priority');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PriorityCount;

    DECLARE @PriorityLocal BIT = (SELECT IsLocal FROM #Actual WHERE FieldKey = N'priority');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PriorityLocal;

    DECLARE @DeadCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'dead');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @DeadCount;
END;
GO
