-- =============================================
-- tSQLt tests for dbo.usp_GetWorkspaceFieldCatalog (Fields tab reconciliation).
-- Covers: the flat, all-object-types read returns ONLY this workspace's own fields (its Local
-- fields and any Global fields it owns, IsLocal = 1), excludes Global fields owned by other
-- workspaces, excludes platform-defined fields, and excludes soft-deleted rows.
-- database-testing.md (AAA, FakeTable, AssertEquals — assign to a local, never inline @Actual=(SELECT)).
-- =============================================

EXEC tSQLt.NewTestClass 'GetWorkspaceFieldCatalogTests';
GO

CREATE PROCEDURE GetWorkspaceFieldCatalogTests.[test_ReturnsOwnLocalAndOwnGlobalExcludesForeignAndPlatform]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, IsSystemProvisioned, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @Ws,      N'Request', N'localReq',      N'Local Req',    N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 1, 0, 0, 0, 0, 0, 0, 0), -- own local — included
        (NEWID(), @Ws,      N'Request', N'ownGlobal',     N'Own Global',   N'ShortText', N'WorkspaceLocal', N'Global',         2, 0, 0, 0, 0, 0, 0, 0), -- own Global — included, IsLocal = 1
        (NEWID(), @OtherWs, N'Request', N'foreignGlobal', N'Foreign G',    N'ShortText', N'WorkspaceLocal', N'Global',         3, 0, 0, 0, 0, 0, 0, 0), -- another ws's Global — excluded
        (NEWID(), @OtherWs, N'Request', N'foreignLocal',  N'Foreign L',    N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 4, 0, 0, 0, 0, 0, 0, 0), -- another ws's local — excluded
        (NEWID(), @Ws,      N'Request', N'platformField', N'Platform Fld', N'ShortText', N'WorkspaceLocal', N'Global',         5, 0, 0, 1, 0, 0, 0, 0); -- platform-defined — excluded

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Location NVARCHAR(20),
        IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT, IsSystemProvisioned BIT, IsRetired BIT, IsLocal BIT);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFieldCatalog @WorkspaceId = @Ws;

    -- Assert — only the two own fields (local + own Global) are returned.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    -- The own Global field is flagged local (this workspace owns it).
    DECLARE @OwnGlobalLocal BIT = (SELECT IsLocal FROM #Actual WHERE FieldKey = N'ownGlobal');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @OwnGlobalLocal;

    -- A Global field owned by another workspace is not surfaced here.
    DECLARE @ForeignGlobalCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'foreignGlobal');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ForeignGlobalCount;

    -- A platform-defined field is not surfaced here (it belongs to the Platform screen).
    DECLARE @PlatformCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'platformField');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @PlatformCount;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldCatalogTests.[test_ExcludesForeignGlobalCollisionAndSoftDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, IsSystemProvisioned, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @Ws,      N'Request', N'priority', N'Priority',     N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 1, 0, 0, 0, 0, 0, 0, 0),
        (NEWID(), @OtherWs, N'Request', N'priority', N'Priority (G)', N'ShortText', N'WorkspaceLocal', N'Global',         2, 0, 0, 0, 0, 0, 0, 0), -- foreign Global, same key — excluded
        (NEWID(), @Ws,      N'Request', N'dead',     N'Dead',         N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 3, 0, 0, 0, 0, 0, 0, 1); -- soft-deleted — excluded

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Location NVARCHAR(20),
        IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT, IsSystemProvisioned BIT, IsRetired BIT, IsLocal BIT);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFieldCatalog @WorkspaceId = @Ws;

    -- Assert — the colliding key resolves once to this workspace's own local row (the foreign Global is gone).
    DECLARE @PriorityCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'priority');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PriorityCount;

    DECLARE @PriorityLocal BIT = (SELECT IsLocal FROM #Actual WHERE FieldKey = N'priority');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @PriorityLocal;

    -- The soft-deleted row is excluded.
    DECLARE @DeadCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey = N'dead');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @DeadCount;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldCatalogTests.[test_WorkspaceOwningNoFieldsReturnsEmpty]
AS
BEGIN
    -- Arrange — only other workspaces' fields exist (Global + Local); the queried workspace owns none.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, IsSystemProvisioned, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @OtherWs, N'Request', N'foreignGlobal', N'Foreign G', N'ShortText', N'WorkspaceLocal', N'Global',         1, 0, 0, 0, 0, 0, 0, 0),
        (NEWID(), @OtherWs, N'Request', N'foreignLocal',  N'Foreign L', N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 2, 0, 0, 0, 0, 0, 0, 0);

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Location NVARCHAR(20),
        IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT, IsSystemProvisioned BIT, IsRetired BIT, IsLocal BIT);
    INSERT INTO #Actual EXEC dbo.usp_GetWorkspaceFieldCatalog @WorkspaceId = @Ws;

    -- Assert — a workspace that owns no fields sees nothing (foreign Globals do not leak in).
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Total;
END;
GO
