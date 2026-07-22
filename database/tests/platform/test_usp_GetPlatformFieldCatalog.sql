-- =============================================
-- tSQLt tests for dbo.usp_GetPlatformFieldCatalog (Slice B1 — Platform Fields catalog).
-- Covers: returns Global, non-platform field definitions across every workspace (IsLocal = 0);
-- excludes LocalWorkspace fields, platform-defined fields, and soft-deleted rows.
-- database-testing.md (AAA, FakeTable, AssertEquals — assign to a local, never inline @Actual=(SELECT)).
-- =============================================

EXEC tSQLt.NewTestClass 'GetPlatformFieldCatalogTests';
GO

CREATE PROCEDURE GetPlatformFieldCatalogTests.[test_ReturnsGlobalAcrossWorkspacesExcludesLocalPlatformDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    DECLARE @WsA UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-0000000000A1';
    DECLARE @WsB UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-0000000000B2';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, IsSystemProvisioned, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @WsA, N'Request', N'globalA',   N'Global A',   N'ShortText', N'WorkspaceLocal', N'Global',         1, 0, 0, 0, 0, 0, 0, 0), -- global, ws A — included
        (NEWID(), @WsB, N'Task',    N'globalB',   N'Global B',   N'ShortText', N'WorkspaceLocal', N'Global',         2, 0, 0, 0, 0, 0, 0, 0), -- global, ws B — included
        (NEWID(), @WsA, N'Request', N'localA',    N'Local A',    N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 3, 0, 0, 0, 0, 0, 0, 0), -- local — excluded
        (NEWID(), @WsA, N'Request', N'platGlobal',N'Plat Global',N'ShortText', N'WorkspaceLocal', N'Global',         4, 0, 0, 1, 0, 0, 0, 0), -- platform-defined — excluded
        (NEWID(), @WsB, N'Request', N'deadGlobal',N'Dead Global',N'ShortText', N'WorkspaceLocal', N'Global',         5, 0, 0, 0, 0, 0, 0, 1); -- soft-deleted — excluded

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Location NVARCHAR(20),
        IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT, IsSystemProvisioned BIT, IsRetired BIT, IsLocal BIT);
    INSERT INTO #Actual EXEC dbo.usp_GetPlatformFieldCatalog;

    -- Assert — the two Global fields (from different workspaces) are returned; the rest are excluded.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    DECLARE @GlobalCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey IN (N'globalA', N'globalB'));
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @GlobalCount;

    -- Global fields carry IsLocal = 0 (read-only on the platform screen).
    DECLARE @LocalFlagCount INT = (SELECT COUNT(*) FROM #Actual WHERE IsLocal = 1);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @LocalFlagCount;

    DECLARE @ExcludedCount INT = (SELECT COUNT(*) FROM #Actual WHERE FieldKey IN (N'localA', N'platGlobal', N'deadGlobal'));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ExcludedCount;
END;
GO

CREATE PROCEDURE GetPlatformFieldCatalogTests.[test_NoGlobalFieldsReturnsEmpty]
AS
BEGIN
    -- Arrange — only Local and platform-defined fields exist.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-0000000000A1';

    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Location, SortOrder, IsRequired, IsReadOnly, IsPlatformDefined, IsSystemProvisioned, AllowNewValues, IsRetired, IsDeleted)
    VALUES
        (NEWID(), @Ws, N'Request', N'localOnly', N'Local Only', N'ShortText', N'WorkspaceLocal', N'LocalWorkspace', 1, 0, 0, 0, 0, 0, 0, 0),
        (NEWID(), @Ws, N'Request', N'platOnly',  N'Plat Only',  N'ShortText', N'WorkspaceLocal', N'Global',         2, 0, 0, 1, 0, 0, 0, 0);

    -- Act
    CREATE TABLE #Actual (FieldDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        FieldKey NVARCHAR(64), DisplayName NVARCHAR(200), FieldType NVARCHAR(32), Location NVARCHAR(20),
        IsRequired BIT, IsReadOnly BIT, IsPlatformDefined BIT, IsSystemProvisioned BIT, IsRetired BIT, IsLocal BIT);
    INSERT INTO #Actual EXEC dbo.usp_GetPlatformFieldCatalog;

    -- Assert — no Global user fields → empty.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Total;
END;
GO
