-- =============================================
-- tSQLt tests for the Object-definition procs (Objects tab, S30).
-- Covers: usp_UpsertObjectDefinition (create, duplicate-name guard, update, update-missing
--         guard), usp_DeleteObjectDefinition (soft-delete + not-found guard),
--         usp_ListObjectDefinitions (excludes deleted, ordered by name),
--         usp_GetObjectRecordCounts (live per-object Records/Fields counts).
-- =============================================

EXEC tSQLt.NewTestClass 'ObjectDefinitionTests';
GO

CREATE PROCEDURE ObjectDefinitionTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.ObjectDefinition';
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Create_InsertsRow]
AS
BEGIN
    -- Arrange
    DECLARE @Id UNIQUEIDENTIFIER;
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';

    -- Act
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL,
        @WorkspaceId        = @Ws,
        @Name               = N'Vendor',
        @PluralLabel        = N'Vendors',
        @Location           = N'LocalWorkspace',
        @Description        = N'A third-party supplier.',
        @ShowInSidebar      = 1,
        @SidebarCategory    = N'Reference',
        @ActorUserId        = N'aa',
        @NewObjectDefinitionId = @Id OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.ObjectDefinition
        WHERE ObjectDefinitionId = @Id AND Name = N'Vendor' AND PluralLabel = N'Vendors'
          AND Location = N'LocalWorkspace' AND ShowInSidebar = 1 AND IsDeleted = 0);
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Create_DuplicateName_Throws]
AS
BEGIN
    -- Arrange — an existing active object named 'Vendor'.
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @First UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL, @WorkspaceId = @Ws, @Name = N'Vendor',
        @Location = N'LocalWorkspace', @ActorUserId = N'aa', @NewObjectDefinitionId = @First OUTPUT;

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%already exists%';

    -- Act — a second object with the same name in the same workspace.
    DECLARE @Second UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL, @WorkspaceId = @Ws, @Name = N'Vendor',
        @Location = N'Global', @ActorUserId = N'aa', @NewObjectDefinitionId = @Second OUTPUT;
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Update_ChangesFields]
AS
BEGIN
    -- Arrange
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @Id UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL, @WorkspaceId = @Ws, @Name = N'Vendor', @PluralLabel = N'Vendors',
        @Location = N'LocalWorkspace', @ActorUserId = N'aa', @NewObjectDefinitionId = @Id OUTPUT;

    -- Act — rename + change plural.
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = @Id, @WorkspaceId = @Ws, @Name = N'Supplier', @PluralLabel = N'Suppliers',
        @Location = N'Global', @ActorUserId = N'bb', @NewObjectDefinitionId = @Id OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.ObjectDefinition
        WHERE ObjectDefinitionId = @Id AND Name = N'Supplier' AND PluralLabel = N'Suppliers'
          AND Location = N'Global' AND UpdatedBy = N'bb');
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Update_Missing_Throws]
AS
BEGIN
    -- Arrange
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @Ghost UNIQUEIDENTIFIER = NEWID();

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not found%';

    -- Act
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = @Ghost, @WorkspaceId = @Ws, @Name = N'X',
        @Location = N'Global', @ActorUserId = N'aa', @NewObjectDefinitionId = @Ghost OUTPUT;
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Delete_SoftDeletes]
AS
BEGIN
    -- Arrange
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @Id UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL, @WorkspaceId = @Ws, @Name = N'Vendor',
        @Location = N'LocalWorkspace', @ActorUserId = N'aa', @NewObjectDefinitionId = @Id OUTPUT;

    -- Act
    EXEC dbo.usp_DeleteObjectDefinition
        @ObjectDefinitionId = @Id, @WorkspaceId = @Ws, @ActorUserId = N'aa';

    -- Assert — the row is soft-deleted (still present, IsDeleted = 1, DeletedAt set).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.ObjectDefinition
        WHERE ObjectDefinitionId = @Id AND IsDeleted = 1 AND DeletedAt IS NOT NULL);
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Delete_Missing_Throws]
AS
BEGIN
    -- Arrange
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';

    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not found%';

    -- Act
    EXEC dbo.usp_DeleteObjectDefinition
        @ObjectDefinitionId = NEWID(), @WorkspaceId = @Ws, @ActorUserId = N'aa';
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_List_ExcludesDeleted_OrderedByName]
AS
BEGIN
    -- Arrange — two active objects (out of alphabetical order) + one soft-deleted.
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, Name, PluralLabel, Location, Description,
         ShowInSidebar, SidebarCategory, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Ws, N'Zebra',  N'Zebras',  N'LocalWorkspace', NULL, 0, NULL, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @Ws, N'Apple',  N'Apples',  N'LocalWorkspace', NULL, 0, NULL, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @Ws, N'Gone',   N'Gones',   N'LocalWorkspace', NULL, 0, NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    CREATE TABLE #List (ObjectDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER,
        Name NVARCHAR(120), PluralLabel NVARCHAR(120), Location NVARCHAR(20),
        Description NVARCHAR(500), ShowInSidebar BIT, SidebarCategory NVARCHAR(80));
    INSERT INTO #List EXEC dbo.usp_ListObjectDefinitions @WorkspaceId = @Ws;

    -- Assert — 2 active rows, deleted excluded, ordered by Name (Apple first).
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #List);
    EXEC tSQLt.AssertEqualsString @Expected = N'Apple', @Actual = (
        SELECT TOP 1 Name FROM #List ORDER BY Name);
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Counts_ReturnsLivePerObjectCounts]
AS
BEGIN
    -- Arrange — fake every backing table the counts proc reads, then seed known rows.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Attachments';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';

    DECLARE @Ws    UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @Other UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-0000000000FF';

    -- 2 active Requests in @Ws + 1 deleted + 1 in another workspace → RequestRecords = 2.
    INSERT INTO dbo.Requests (WorkspaceId, IsDeleted) VALUES (@Ws, 0), (@Ws, 0), (@Ws, 1), (@Other, 0);
    -- 3 active Tasks.
    INSERT INTO dbo.Tasks (WorkspaceId, IsDeleted) VALUES (@Ws, 0), (@Ws, 0), (@Ws, 0);
    -- 1 active Attachment.
    INSERT INTO dbo.Attachments (WorkspaceId, IsDeleted) VALUES (@Ws, 0);
    -- 0 active Features (1 deleted only).
    INSERT INTO dbo.Features (WorkspaceId, IsDeleted) VALUES (@Ws, 1);
    -- 4 active Toolkit items.
    INSERT INTO dbo.ToolkitItem (WorkspaceId, IsDeleted) VALUES (@Ws, 0), (@Ws, 0), (@Ws, 0), (@Ws, 0);
    -- Fields: 3 active Request + 1 retired Request + 1 active Task → RequestFields = 3, TaskFields = 1.
    INSERT INTO dbo.FieldDefinition (WorkspaceId, ObjectType, IsDeleted, IsRetired)
    VALUES (@Ws, N'Request', 0, 0), (@Ws, N'Request', 0, 0), (@Ws, N'Request', 0, 0),
           (@Ws, N'Request', 0, 1), (@Ws, N'Task', 0, 0);

    -- Act
    CREATE TABLE #Counts (RequestRecords INT, TaskRecords INT, AttachmentRecords INT,
        FeatureRecords INT, ToolkitRecords INT, RequestFields INT, TaskFields INT, FeatureFields INT);
    INSERT INTO #Counts EXEC dbo.usp_GetObjectRecordCounts @WorkspaceId = @Ws;

    -- Assert
    DECLARE @Row TABLE (Col SYSNAME, Val INT);
    INSERT INTO @Row
        SELECT 'RequestRecords', RequestRecords FROM #Counts UNION ALL
        SELECT 'TaskRecords', TaskRecords FROM #Counts UNION ALL
        SELECT 'AttachmentRecords', AttachmentRecords FROM #Counts UNION ALL
        SELECT 'FeatureRecords', FeatureRecords FROM #Counts UNION ALL
        SELECT 'ToolkitRecords', ToolkitRecords FROM #Counts UNION ALL
        SELECT 'RequestFields', RequestFields FROM #Counts UNION ALL
        SELECT 'TaskFields', TaskFields FROM #Counts;

    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT Val FROM @Row WHERE Col = 'RequestRecords');
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = (SELECT Val FROM @Row WHERE Col = 'TaskRecords');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT Val FROM @Row WHERE Col = 'AttachmentRecords');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT Val FROM @Row WHERE Col = 'FeatureRecords');
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = (SELECT Val FROM @Row WHERE Col = 'ToolkitRecords');
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = (SELECT Val FROM @Row WHERE Col = 'RequestFields');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT Val FROM @Row WHERE Col = 'TaskFields');
END;
GO
