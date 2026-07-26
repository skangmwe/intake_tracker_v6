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

CREATE PROCEDURE ObjectDefinitionTests.[test_Insert_SetsUniqueObjectKeyFromName]
AS
BEGIN
    -- Arrange
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @Id UNIQUEIDENTIFIER;
    DECLARE @Id2 UNIQUEIDENTIFIER;

    -- Act — a single-word and a multi-word name.
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL, @WorkspaceId = @Ws, @Name = N'Vendor',
        @Location = N'LocalWorkspace', @ActorUserId = N'aa', @NewObjectDefinitionId = @Id OUTPUT;
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL, @WorkspaceId = @Ws, @Name = N'Purchase Order',
        @Location = N'LocalWorkspace', @ActorUserId = N'aa', @NewObjectDefinitionId = @Id2 OUTPUT;

    -- Assert — slug is the lowercased name with separators collapsed to '-'.
    EXEC tSQLt.AssertEqualsString @Expected = N'vendor', @Actual = (
        SELECT ObjectKey FROM dbo.ObjectDefinition WHERE ObjectDefinitionId = @Id);
    EXEC tSQLt.AssertEqualsString @Expected = N'purchase-order', @Actual = (
        SELECT ObjectKey FROM dbo.ObjectDefinition WHERE ObjectDefinitionId = @Id2);
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Insert_DisambiguatesOnCollision]
AS
BEGIN
    -- Arrange — a pre-existing active row that already owns the slug 'vendor'. Its Name differs
    -- ('Vendor Master') so the name-uniqueness guard does not fire; we isolate slug disambiguation.
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Ws, N'vendor', N'Vendor Master', N'LocalWorkspace', 0,
            SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act — create an object whose Name slugifies to the taken 'vendor'.
    DECLARE @Id UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL, @WorkspaceId = @Ws, @Name = N'Vendor',
        @Location = N'LocalWorkspace', @ActorUserId = N'aa', @NewObjectDefinitionId = @Id OUTPUT;

    -- Assert — the new slug is disambiguated with a numeric suffix ('vendor-2').
    EXEC tSQLt.AssertEqualsString @Expected = N'vendor-2', @Actual = (
        SELECT ObjectKey FROM dbo.ObjectDefinition WHERE ObjectDefinitionId = @Id);
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
    -- Arrange — two active objects (out of alphabetical order) + one soft-deleted. Distinct
    -- ObjectKey values are required: the list proc dedups local-wins PARTITION BY ObjectKey, and
    -- FakeTable drops the NOT NULL constraint, so leaving ObjectKey unset would collapse the two
    -- active rows into the same NULL partition and hide one of them.
    DECLARE @Ws UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, PluralLabel, Location, Description,
         ShowInSidebar, SidebarCategory, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Ws, N'zebra', N'Zebra',  N'Zebras',  N'LocalWorkspace', NULL, 0, NULL, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @Ws, N'apple', N'Apple',  N'Apples',  N'LocalWorkspace', NULL, 0, NULL, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @Ws, N'gone',  N'Gone',   N'Gones',   N'LocalWorkspace', NULL, 0, NULL, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    CREATE TABLE #List (ObjectDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER,
        ObjectKey NVARCHAR(64), Name NVARCHAR(120), PluralLabel NVARCHAR(120), Location NVARCHAR(20),
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

CREATE PROCEDURE ObjectDefinitionTests.[test_CustomObjectCounts_LiveFieldsAndRecords]
AS
BEGIN
    -- Arrange — one custom object with fields + records, one with none. FieldDefinition and
    -- CustomRecords are faked and seeded.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.CustomRecords';
    DECLARE @Ws    UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @Obj   UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-0000000000C1';
    DECLARE @Empty UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-0000000000C2';

    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Obj,   @Ws, N'vendor', N'Vendor', N'LocalWorkspace', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
           (@Empty, @Ws, N'empty',  N'Empty',  N'LocalWorkspace', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- 3 active 'vendor' fields + 1 retired + 1 deleted + 1 field on a different object → FieldsCount = 3.
    -- FieldDefinitionId is supplied because the fake table has no default and the proc counts the PK.
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, IsDeleted, IsRetired)
    VALUES (NEWID(), @Ws, N'vendor', 0, 0), (NEWID(), @Ws, N'vendor', 0, 0), (NEWID(), @Ws, N'vendor', 0, 0),
           (NEWID(), @Ws, N'vendor', 0, 1),   -- retired, excluded
           (NEWID(), @Ws, N'vendor', 1, 0),   -- deleted, excluded
           (NEWID(), @Ws, N'other',  0, 0);   -- different object, excluded

    -- 2 active vendor records + 1 deleted + 1 on the other object → RecordsCount(vendor) = 2.
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Obj,   @Ws, N'r1', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj,   @Ws, N'r2', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj,   @Ws, N'r3', N'{}', 1, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),  -- deleted, excluded
           (NEWID(), @Empty, @Ws, N'e1', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');   -- other object

    -- Act
    CREATE TABLE #Counts (ObjectDefinitionId UNIQUEIDENTIFIER, FieldsCount INT, RecordsCount INT);
    INSERT INTO #Counts EXEC dbo.usp_GetCustomObjectCounts @WorkspaceId = @Ws;

    -- Assert — vendor: 3 live fields + 2 live records; the empty object appears with 0 fields + 1 record.
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = (SELECT FieldsCount  FROM #Counts WHERE ObjectDefinitionId = @Obj);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT RecordsCount FROM #Counts WHERE ObjectDefinitionId = @Obj);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT FieldsCount  FROM #Counts WHERE ObjectDefinitionId = @Empty);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT RecordsCount FROM #Counts WHERE ObjectDefinitionId = @Empty);
END;
GO

-- =============================================
-- Global custom objects (SP3b Slice 1) — surfaced/resolved/upserted from any workspace.
-- =============================================

CREATE PROCEDURE ObjectDefinitionTests.[test_List_IncludesGlobalObject_ForNonOwningWorkspace]
AS
BEGIN
    -- Arrange — a Global object (WorkspaceId NULL) plus a local object owned by a DIFFERENT
    -- workspace than the caller. The caller owns neither, so only the Global row should surface.
    DECLARE @Ws     UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-0000000000FE';
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, PluralLabel, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), NULL,      N'firm-policy', N'Firm Policy', N'Firm Policies', N'Global',        0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @OtherWs,  N'other-only',  N'Other Only',  N'Other Onlys',   N'LocalWorkspace', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    CREATE TABLE #List (ObjectDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER,
        ObjectKey NVARCHAR(64), Name NVARCHAR(120), PluralLabel NVARCHAR(120), Location NVARCHAR(20),
        Description NVARCHAR(500), ShowInSidebar BIT, SidebarCategory NVARCHAR(80));
    INSERT INTO #List EXEC dbo.usp_ListObjectDefinitions @WorkspaceId = @Ws;

    -- Assert — the Global object surfaces; the other workspace's local object does not.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #List);
    EXEC tSQLt.AssertEqualsString @Expected = N'Firm Policy', @Actual = (SELECT TOP 1 Name FROM #List);
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_List_LocalObjectShadowsSameSlugGlobal]
AS
BEGIN
    -- Arrange — a Global object and a local object in the caller's own workspace that share the
    -- same ObjectKey slug. Local must win the dedup — the caller sees its own row, not the Global one.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, PluralLabel, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), NULL, N'vendor', N'Global Vendor', N'Global Vendors', N'Global',        0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed'),
        (NEWID(), @Ws,  N'vendor', N'Local Vendor',  N'Local Vendors',  N'LocalWorkspace', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    CREATE TABLE #List (ObjectDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER,
        ObjectKey NVARCHAR(64), Name NVARCHAR(120), PluralLabel NVARCHAR(120), Location NVARCHAR(20),
        Description NVARCHAR(500), ShowInSidebar BIT, SidebarCategory NVARCHAR(80));
    INSERT INTO #List EXEC dbo.usp_ListObjectDefinitions @WorkspaceId = @Ws;

    -- Assert — exactly one row for the shared slug, and it is the local one.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #List WHERE ObjectKey = N'vendor');
    EXEC tSQLt.AssertEqualsString @Expected = N'Local Vendor', @Actual = (
        SELECT Name FROM #List WHERE ObjectKey = N'vendor');
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_GetById_ResolvesGlobalObject_ForNonOwningWorkspace]
AS
BEGIN
    -- Arrange — a Global object, and a caller workspace that does not own it.
    DECLARE @Ws  UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @Id  UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-0000000000D1';
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, PluralLabel, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Id, NULL, N'firm-policy', N'Firm Policy', N'Firm Policies', N'Global', 0,
            SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    CREATE TABLE #Row (ObjectDefinitionId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER,
        ObjectKey NVARCHAR(64), Name NVARCHAR(120), PluralLabel NVARCHAR(120), Location NVARCHAR(20),
        Description NVARCHAR(500), ShowInSidebar BIT, SidebarCategory NVARCHAR(80));
    INSERT INTO #Row EXEC dbo.usp_GetObjectDefinitionById @ObjectDefinitionId = @Id, @WorkspaceId = @Ws;

    -- Assert — resolves despite the caller not owning it.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Row WHERE ObjectDefinitionId = @Id);
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Upsert_NullWorkspace_CreatesGlobalRow]
AS
BEGIN
    -- Arrange
    DECLARE @Id UNIQUEIDENTIFIER;

    -- Act — @WorkspaceId = NULL creates a Global object.
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL,
        @WorkspaceId        = NULL,
        @Name               = N'Firm Policy',
        @PluralLabel        = N'Firm Policies',
        @Location           = N'Global',
        @ActorUserId        = N'platform-admin',
        @NewObjectDefinitionId = @Id OUTPUT;

    -- Assert — a NULL-workspace row with a unique slug in the Global namespace.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (
        SELECT COUNT(*) FROM dbo.ObjectDefinition
        WHERE ObjectDefinitionId = @Id AND WorkspaceId IS NULL AND Location = N'Global'
          AND Name = N'Firm Policy' AND IsDeleted = 0);
    EXEC tSQLt.AssertEqualsString @Expected = N'firm-policy', @Actual = (
        SELECT ObjectKey FROM dbo.ObjectDefinition WHERE ObjectDefinitionId = @Id);
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_Upsert_NullWorkspace_DisambiguatesWithinGlobalNamespace]
AS
BEGIN
    -- Arrange — an existing active Global row that already owns the slug 'vendor'. Its Name
    -- differs so the name-uniqueness guard does not fire; this isolates slug disambiguation
    -- within the Global namespace (not the calling workspace's, since @Ws is NULL).
    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), NULL, N'vendor', N'Vendor Master', N'Global', 0,
            SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- Act
    DECLARE @Id UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertObjectDefinition
        @ObjectDefinitionId = NULL, @WorkspaceId = NULL, @Name = N'Vendor',
        @Location = N'Global', @ActorUserId = N'platform-admin', @NewObjectDefinitionId = @Id OUTPUT;

    -- Assert — disambiguated within the Global namespace.
    EXEC tSQLt.AssertEqualsString @Expected = N'vendor-2', @Actual = (
        SELECT ObjectKey FROM dbo.ObjectDefinition WHERE ObjectDefinitionId = @Id);
END;
GO

CREATE PROCEDURE ObjectDefinitionTests.[test_CustomObjectCounts_GlobalObject_ReturnsCallingWorkspaceRecordCount]
AS
BEGIN
    -- Arrange — a Global object with records in TWO different workspaces; the calling workspace
    -- must see only its own record count (never the other workspace's, and never a NULL/zero
    -- artifact from correlating on o.WorkspaceId, which is NULL for a Global object).
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.CustomRecords';
    DECLARE @Ws      UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-0000000000FE';
    DECLARE @Obj     UNIQUEIDENTIFIER = 'A2000000-0000-4000-8000-0000000000D2';

    INSERT INTO dbo.ObjectDefinition
        (ObjectDefinitionId, WorkspaceId, ObjectKey, Name, Location, IsDeleted,
         CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (@Obj, NULL, N'firm-policy', N'Firm Policy', N'Global', 0,
            SYSUTCDATETIME(), SYSUTCDATETIME(), N'seed', N'seed');

    -- 2 active records in the calling workspace, 1 active in another workspace, 1 deleted.
    INSERT INTO dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Obj, @Ws,      N'r1', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj, @Ws,      N'r2', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj, @Ws,      N'r3', N'{}', 1, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's'),
           (NEWID(), @Obj, @OtherWs, N'r4', N'{}', 0, SYSUTCDATETIME(), SYSUTCDATETIME(), N's', N's');

    -- Act
    CREATE TABLE #Counts (ObjectDefinitionId UNIQUEIDENTIFIER, FieldsCount INT, RecordsCount INT);
    INSERT INTO #Counts EXEC dbo.usp_GetCustomObjectCounts @WorkspaceId = @Ws;

    -- Assert — 2 records for the calling workspace; 0 fields (Slice 1 has no Global fields).
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT RecordsCount FROM #Counts WHERE ObjectDefinitionId = @Obj);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT FieldsCount  FROM #Counts WHERE ObjectDefinitionId = @Obj);
END;
GO
