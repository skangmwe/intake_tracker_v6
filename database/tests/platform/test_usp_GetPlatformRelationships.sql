-- =============================================
-- tSQLt tests for dbo.usp_GetPlatformRelationships (Slice B2 — Platform Relationships tab).
-- Covers: returns only system relationships, de-duplicated to one canonical row per
-- (Name, From, To, Cardinality) across workspaces; excludes non-system, retired, and deleted rows.
-- database-testing.md (AAA, FakeTable, AssertEquals — assign to a local, never inline @Actual=(SELECT)).
-- =============================================

EXEC tSQLt.NewTestClass 'GetPlatformRelationshipsTests';
GO

CREATE PROCEDURE GetPlatformRelationshipsTests.[test_ReturnsDistinctSystemRelationshipsExcludesRest]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Relationships';
    DECLARE @WsA UNIQUEIDENTIFIER = '2B250000-0000-4000-8000-0000000000A1';
    DECLARE @WsB UNIQUEIDENTIFIER = '2B250000-0000-4000-8000-0000000000B2';

    INSERT INTO dbo.Relationships (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality, FromSideLabel, ToSideLabel, ShowOnFromAsTab, SortOrder, IsRetired, IsSystem, IsDeleted, CreatedAt)
    VALUES
        -- Same canonical system relationship seeded into two workspaces → de-duped to one row.
        (NEWID(), @WsA, N'Request has Tasks',       N'Request', N'Task',       N'OneToMany', N'Tasks',       N'Request', 1, 1, 0, 1, 0, '2026-01-01'),
        (NEWID(), @WsB, N'Request has Tasks',       N'Request', N'Task',       N'OneToMany', N'Tasks',       N'Request', 1, 1, 0, 1, 0, '2026-02-01'),
        -- A distinct system relationship → its own row.
        (NEWID(), @WsA, N'Request has Attachments', N'Request', N'Attachment', N'OneToMany', N'Attachments', N'Request', 1, 2, 0, 1, 0, '2026-01-01'),
        -- Non-system → excluded.
        (NEWID(), @WsA, N'Request relates Feature', N'Request', N'Feature',    N'ManyToMany',N'Features',    N'Request', 0, 3, 0, 0, 0, '2026-01-01'),
        -- Retired system → excluded.
        (NEWID(), @WsA, N'Retired system',          N'Request', N'Task',       N'OneToOne',  N'X',           N'Y',       0, 4, 1, 1, 0, '2026-01-01'),
        -- Soft-deleted system → excluded.
        (NEWID(), @WsA, N'Deleted system',          N'Task',    N'Attachment', N'OneToMany', N'X',           N'Y',       0, 5, 0, 1, 1, '2026-01-01');

    -- Act
    CREATE TABLE #Actual (RelationshipId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200),
        FromObjectType NVARCHAR(50), ToObjectType NVARCHAR(50), Cardinality NVARCHAR(20),
        FromSideLabel NVARCHAR(200), ToSideLabel NVARCHAR(200), ShowOnFromAsTab BIT, TabLabel NVARCHAR(200),
        SortOrder INT, IsRetired BIT, IsSystem BIT, CreatedAt DATETIME2, UpdatedAt DATETIME2,
        CreatedBy NVARCHAR(256), UpdatedBy NVARCHAR(256));
    INSERT INTO #Actual EXEC dbo.usp_GetPlatformRelationships;

    -- Assert — two canonical system relationships (Request→Task de-duped, Request→Attachment).
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    DECLARE @TaskRel INT = (SELECT COUNT(*) FROM #Actual WHERE Name = N'Request has Tasks');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @TaskRel;

    DECLARE @AttachRel INT = (SELECT COUNT(*) FROM #Actual WHERE Name = N'Request has Attachments');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @AttachRel;

    DECLARE @Excluded INT = (SELECT COUNT(*) FROM #Actual
        WHERE Name IN (N'Request relates Feature', N'Retired system', N'Deleted system'));
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Excluded;
END;
GO

CREATE PROCEDURE GetPlatformRelationshipsTests.[test_NoSystemRelationshipsReturnsEmpty]
AS
BEGIN
    -- Arrange — only a non-system relationship exists.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Relationships';
    DECLARE @Ws UNIQUEIDENTIFIER = '2B250000-0000-4000-8000-0000000000A1';

    INSERT INTO dbo.Relationships (RelationshipId, WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality, FromSideLabel, ToSideLabel, ShowOnFromAsTab, SortOrder, IsRetired, IsSystem, IsDeleted, CreatedAt)
    VALUES (NEWID(), @Ws, N'Custom', N'Request', N'Feature', N'ManyToMany', N'Features', N'Request', 0, 1, 0, 0, 0, '2026-01-01');

    -- Act
    CREATE TABLE #Actual (RelationshipId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200),
        FromObjectType NVARCHAR(50), ToObjectType NVARCHAR(50), Cardinality NVARCHAR(20),
        FromSideLabel NVARCHAR(200), ToSideLabel NVARCHAR(200), ShowOnFromAsTab BIT, TabLabel NVARCHAR(200),
        SortOrder INT, IsRetired BIT, IsSystem BIT, CreatedAt DATETIME2, UpdatedAt DATETIME2,
        CreatedBy NVARCHAR(256), UpdatedBy NVARCHAR(256));
    INSERT INTO #Actual EXEC dbo.usp_GetPlatformRelationships;

    -- Assert
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Total;
END;
GO
