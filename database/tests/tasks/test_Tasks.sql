-- =============================================
-- tSQLt tests for the Tasks procs (Slice 7).
-- Covers: create (access gate, SortOrder sequence, typed field), bundle apply (order,
--         unknown bundle), patch (check-off stamps CompletedAt / reopen clears, access gate),
--         list ordering (open first, done sinks), and the bundle-template read.
-- database-testing.md (AAA, FakeTable). GUIDs are synthetic; no real PII.
-- NOTE: a subquery cannot be passed directly as a proc argument (EXEC @p = (SELECT …) is a syntax
--       error), so every asserted value is read into a local variable first.
-- =============================================

EXEC tSQLt.NewTestClass 'TasksTests';
GO

-- ── Create ────────────────────────────────────────────────────────────────────

CREATE PROCEDURE TasksTests.[test_CreateTaskInsertsForMemberWithSequence]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Rec', N'execution', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    -- Act — two tasks; the second must get the next SortOrder.
    EXEC dbo.usp_CreateTask
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Author = '00000000-0000-4000-8000-0000000000aa', @Title = N'First task', @Phase = N'Triage',
        @AssigneeUserId = '00000000-0000-4000-8000-0000000000aa',
        @FieldDefinitionId = NULL, @FieldLabel = NULL, @FieldType = NULL,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    EXEC dbo.usp_CreateTask
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Author = '00000000-0000-4000-8000-0000000000aa', @Title = N'Second task', @Phase = N'Execution',
        @AssigneeUserId = '00000000-0000-4000-8000-0000000000aa',
        @FieldDefinitionId = NULL, @FieldLabel = NULL, @FieldType = NULL,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert
    DECLARE @Count       INT           = (SELECT COUNT(*) FROM dbo.Tasks);
    DECLARE @FirstOrder  INT           = (SELECT SortOrder FROM dbo.Tasks WHERE Title = N'First task');
    DECLARE @SecondOrder INT           = (SELECT SortOrder FROM dbo.Tasks WHERE Title = N'Second task');
    DECLARE @FirstStatus NVARCHAR(16)  = (SELECT Status FROM dbo.Tasks WHERE Title = N'First task');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @FirstOrder;
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @SecondOrder;
    EXEC tSQLt.AssertEqualsString @Expected = N'Open', @Actual = @FirstStatus;
END;
GO

CREATE PROCEDURE TasksTests.[test_CreateTaskDeniedForNonMemberInsertsNothing]
AS
BEGIN
    -- Arrange — the record exists, but the caller has no membership.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Rec', N'execution', N'{}', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Created (TaskId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER,
        Title NVARCHAR(400), Phase NVARCHAR(32), AssigneeUserId UNIQUEIDENTIFIER, Status NVARCHAR(16),
        Notes NVARCHAR(MAX), CompletedAt DATETIME2, SortOrder INT,
        FieldDefinitionId UNIQUEIDENTIFIER, FieldLabel NVARCHAR(200), FieldType NVARCHAR(16),
        FieldValueUrl NVARCHAR(2048), FieldValueText NVARCHAR(MAX), FieldValueNumber DECIMAL(18,4),
        FieldValueDate DATE, FieldValueSelect NVARCHAR(200), FieldValueBool BIT, CreatedAt DATETIME2);
    INSERT INTO #Created
    EXEC dbo.usp_CreateTask
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Author = '00000000-0000-4000-8000-0000000000bb', @Title = N'Sneaky', @Phase = N'Execution',
        @AssigneeUserId = NULL,
        @FieldDefinitionId = NULL, @FieldLabel = NULL, @FieldType = NULL,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert — nothing inserted, nothing returned (API turns this into a 403).
    DECLARE @TaskCount     INT = (SELECT COUNT(*) FROM dbo.Tasks);
    DECLARE @ReturnedCount INT = (SELECT COUNT(*) FROM #Created);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @TaskCount;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ReturnedCount;
END;
GO

CREATE PROCEDURE TasksTests.[test_CreateTaskStoresTypedUrlField]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Rec', N'execution', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    -- Act
    EXEC dbo.usp_CreateTask
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Author = '00000000-0000-4000-8000-0000000000aa', @Title = N'Create repo', @Phase = N'Execution',
        @AssigneeUserId = '00000000-0000-4000-8000-0000000000aa',
        @FieldDefinitionId = '33333333-3333-4333-8333-333333333333', @FieldLabel = N'Repo URL', @FieldType = N'url',
        @FieldValueUrl = N'github.com/mws-ai/extract', @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert
    DECLARE @FieldType NVARCHAR(16)   = (SELECT FieldType FROM dbo.Tasks);
    DECLARE @FieldUrl   NVARCHAR(2048) = (SELECT FieldValueUrl FROM dbo.Tasks);
    DECLARE @FieldLabel NVARCHAR(200)  = (SELECT FieldLabel FROM dbo.Tasks);
    EXEC tSQLt.AssertEqualsString @Expected = N'url', @Actual = @FieldType;
    EXEC tSQLt.AssertEqualsString @Expected = N'github.com/mws-ai/extract', @Actual = @FieldUrl;
    EXEC tSQLt.AssertEqualsString @Expected = N'Repo URL', @Actual = @FieldLabel;
END;
GO

-- ── Bundle apply ───────────────────────────────────────────────────────────────

CREATE PROCEDURE TasksTests.[test_ApplyBundleAppendsTemplateTasksInOrder]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.TaskBundleTemplate';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Rec', N'execution', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.TaskBundleTemplate (TaskBundleTemplateId, WorkspaceId, TemplateKey, Name, TasksJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('44444444-4444-4444-8444-444444444444', '1A150000-0000-4000-8000-000000000001', N'k', N'Bundle',
            N'[{"title":"Alpha","phase":"Triage"},{"title":"Beta","phase":"Execution"}]', 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_ApplyTaskBundle
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Author = '00000000-0000-4000-8000-0000000000aa', @BundleTemplateId = '44444444-4444-4444-8444-444444444444';

    -- Assert — both tasks landed, in array order via SortOrder.
    DECLARE @Count INT          = (SELECT COUNT(*) FROM dbo.Tasks);
    DECLARE @First NVARCHAR(400) = (SELECT Title FROM dbo.Tasks WHERE SortOrder = 1);
    DECLARE @Second NVARCHAR(400) = (SELECT Title FROM dbo.Tasks WHERE SortOrder = 2);
    DECLARE @BetaPhase NVARCHAR(32) = (SELECT Phase FROM dbo.Tasks WHERE Title = N'Beta');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
    EXEC tSQLt.AssertEqualsString @Expected = N'Alpha', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = N'Beta', @Actual = @Second;
    EXEC tSQLt.AssertEqualsString @Expected = N'Execution', @Actual = @BetaPhase;
END;
GO

CREATE PROCEDURE TasksTests.[test_ApplyBundleUnknownTemplateInsertsNothing]
AS
BEGIN
    -- Arrange — accessible record, but the bundle id does not exist for the workspace.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.TaskBundleTemplate';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Rec', N'execution', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    -- Act
    EXEC dbo.usp_ApplyTaskBundle
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Author = '00000000-0000-4000-8000-0000000000aa', @BundleTemplateId = '99999999-9999-4999-8999-999999999999';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Tasks);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

-- ── Patch ─────────────────────────────────────────────────────────────────────

CREATE PROCEDURE TasksTests.[test_PatchCheckOffStampsThenReopenClears]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('55555555-5555-4555-8555-555555555555', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            N'Do it', N'Execution', N'Open', 1, 0, N'seed', N'seed');

    -- Act 1 — mark Done.
    EXEC dbo.usp_PatchTask
        @TaskId = '55555555-5555-4555-8555-555555555555', @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetTitle = 0, @Title = NULL, @SetPhase = 0, @Phase = NULL, @SetAssignee = 0, @AssigneeUserId = NULL,
        @SetStatus = 1, @Status = N'Done', @SetNotes = 0, @Notes = NULL,
        @SetTypedFieldValue = 0,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert 1 — Done stamps CompletedAt.
    DECLARE @Status1 NVARCHAR(16) = (SELECT Status FROM dbo.Tasks);
    DECLARE @Done1   NVARCHAR(10) = (SELECT CASE WHEN CompletedAt IS NULL THEN 'NULL' ELSE 'NOT NULL' END FROM dbo.Tasks);
    EXEC tSQLt.AssertEqualsString @Expected = N'Done', @Actual = @Status1;
    EXEC tSQLt.AssertEqualsString @Expected = 'NOT NULL', @Actual = @Done1;

    -- Act 2 — reopen.
    EXEC dbo.usp_PatchTask
        @TaskId = '55555555-5555-4555-8555-555555555555', @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetTitle = 0, @Title = NULL, @SetPhase = 0, @Phase = NULL, @SetAssignee = 0, @AssigneeUserId = NULL,
        @SetStatus = 1, @Status = N'Open', @SetNotes = 0, @Notes = NULL,
        @SetTypedFieldValue = 0,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert 2 — reopening clears CompletedAt.
    DECLARE @Status2 NVARCHAR(16) = (SELECT Status FROM dbo.Tasks);
    DECLARE @Done2   NVARCHAR(10) = (SELECT CASE WHEN CompletedAt IS NULL THEN 'NULL' ELSE 'NOT NULL' END FROM dbo.Tasks);
    EXEC tSQLt.AssertEqualsString @Expected = N'Open', @Actual = @Status2;
    EXEC tSQLt.AssertEqualsString @Expected = 'NULL', @Actual = @Done2;
END;
GO

CREATE PROCEDURE TasksTests.[test_PatchNotesLeavesOtherFields]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('55555555-5555-4555-8555-555555555555', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            N'Original', N'Execution', N'Open', 1, 0, N'seed', N'seed');

    -- Act — set only Notes; Title/Status must be untouched.
    EXEC dbo.usp_PatchTask
        @TaskId = '55555555-5555-4555-8555-555555555555', @UserId = '00000000-0000-4000-8000-0000000000aa',
        @SetTitle = 0, @Title = NULL, @SetPhase = 0, @Phase = NULL, @SetAssignee = 0, @AssigneeUserId = NULL,
        @SetStatus = 0, @Status = NULL, @SetNotes = 1, @Notes = N'Decided to use option B',
        @SetTypedFieldValue = 0,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert
    DECLARE @Notes  NVARCHAR(MAX) = (SELECT Notes FROM dbo.Tasks);
    DECLARE @Title  NVARCHAR(400) = (SELECT Title FROM dbo.Tasks);
    DECLARE @Status NVARCHAR(16)  = (SELECT Status FROM dbo.Tasks);
    EXEC tSQLt.AssertEqualsString @Expected = N'Decided to use option B', @Actual = @Notes;
    EXEC tSQLt.AssertEqualsString @Expected = N'Original', @Actual = @Title;
    EXEC tSQLt.AssertEqualsString @Expected = N'Open', @Actual = @Status;
END;
GO

CREATE PROCEDURE TasksTests.[test_PatchDeniedForNonMemberReturnsNothing]
AS
BEGIN
    -- Arrange — task exists, caller is not a member.
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('55555555-5555-4555-8555-555555555555', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001',
            N'Original', N'Execution', N'Open', 1, 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Patched (TaskId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER,
        Title NVARCHAR(400), Phase NVARCHAR(32), AssigneeUserId UNIQUEIDENTIFIER, Status NVARCHAR(16),
        Notes NVARCHAR(MAX), CompletedAt DATETIME2, SortOrder INT,
        FieldDefinitionId UNIQUEIDENTIFIER, FieldLabel NVARCHAR(200), FieldType NVARCHAR(16),
        FieldValueUrl NVARCHAR(2048), FieldValueText NVARCHAR(MAX), FieldValueNumber DECIMAL(18,4),
        FieldValueDate DATE, FieldValueSelect NVARCHAR(200), FieldValueBool BIT, CreatedAt DATETIME2);
    INSERT INTO #Patched
    EXEC dbo.usp_PatchTask
        @TaskId = '55555555-5555-4555-8555-555555555555', @UserId = '00000000-0000-4000-8000-0000000000bb',
        @SetTitle = 1, @Title = N'Hijacked', @SetPhase = 0, @Phase = NULL, @SetAssignee = 0, @AssigneeUserId = NULL,
        @SetStatus = 0, @Status = NULL, @SetNotes = 0, @Notes = NULL,
        @SetTypedFieldValue = 0,
        @FieldValueUrl = NULL, @FieldValueText = NULL, @FieldValueNumber = NULL,
        @FieldValueDate = NULL, @FieldValueSelect = NULL, @FieldValueBool = NULL;

    -- Assert — nothing returned, and the title is unchanged.
    DECLARE @ReturnedCount INT = (SELECT COUNT(*) FROM #Patched);
    DECLARE @Title NVARCHAR(400) = (SELECT Title FROM dbo.Tasks);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ReturnedCount;
    EXEC tSQLt.AssertEqualsString @Expected = N'Original', @Actual = @Title;
END;
GO

-- ── List ordering ───────────────────────────────────────────────────────────────

CREATE PROCEDURE TasksTests.[test_GetTasksOpenFirstDoneSinks]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
    -- Insert a Done task before an Open task by SortOrder; the read must still float Open first.
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('11111111-1111-4111-8111-111111111111', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'DoneEarly', N'Execution', N'Done', 1, 0, N'seed', N'seed'),
           ('22222222-2222-4222-8222-222222222222', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'OpenLate', N'Execution', N'Open', 2, 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Rows (rn INT IDENTITY(1,1), TaskId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER,
        Title NVARCHAR(400), Phase NVARCHAR(32), AssigneeUserId UNIQUEIDENTIFIER, Status NVARCHAR(16),
        Notes NVARCHAR(MAX), CompletedAt DATETIME2, SortOrder INT,
        FieldDefinitionId UNIQUEIDENTIFIER, FieldLabel NVARCHAR(200), FieldType NVARCHAR(16),
        FieldValueUrl NVARCHAR(2048), FieldValueText NVARCHAR(MAX), FieldValueNumber DECIMAL(18,4),
        FieldValueDate DATE, FieldValueSelect NVARCHAR(200), FieldValueBool BIT, CreatedAt DATETIME2);
    INSERT INTO #Rows (TaskId, RecordId, WorkspaceId, Title, Phase, AssigneeUserId, Status, Notes, CompletedAt, SortOrder,
        FieldDefinitionId, FieldLabel, FieldType, FieldValueUrl, FieldValueText, FieldValueNumber, FieldValueDate, FieldValueSelect, FieldValueBool, CreatedAt)
    EXEC dbo.usp_GetTasksForRequest @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — Open floats to row 1 even though its SortOrder is higher.
    DECLARE @Row1 NVARCHAR(400) = (SELECT Title FROM #Rows WHERE rn = 1);
    DECLARE @Row2 NVARCHAR(400) = (SELECT Title FROM #Rows WHERE rn = 2);
    EXEC tSQLt.AssertEqualsString @Expected = N'OpenLate', @Actual = @Row1;
    EXEC tSQLt.AssertEqualsString @Expected = N'DoneEarly', @Actual = @Row2;
END;
GO

CREATE PROCEDURE TasksTests.[test_GetTasksDeniedForNonMemberReturnsNothing]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, Status, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('11111111-1111-4111-8111-111111111111', N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Secret', N'Execution', N'Open', 1, 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Rows (TaskId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER,
        Title NVARCHAR(400), Phase NVARCHAR(32), AssigneeUserId UNIQUEIDENTIFIER, Status NVARCHAR(16),
        Notes NVARCHAR(MAX), CompletedAt DATETIME2, SortOrder INT,
        FieldDefinitionId UNIQUEIDENTIFIER, FieldLabel NVARCHAR(200), FieldType NVARCHAR(16),
        FieldValueUrl NVARCHAR(2048), FieldValueText NVARCHAR(MAX), FieldValueNumber DECIMAL(18,4),
        FieldValueDate DATE, FieldValueSelect NVARCHAR(200), FieldValueBool BIT, CreatedAt DATETIME2);
    INSERT INTO #Rows
    EXEC dbo.usp_GetTasksForRequest @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

-- ── Bundle-template read ─────────────────────────────────────────────────────────

CREATE PROCEDURE TasksTests.[test_GetBundleTemplatesReturnsWorkspaceRowsInOrder]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.TaskBundleTemplate';
    INSERT INTO dbo.TaskBundleTemplate (TaskBundleTemplateId, WorkspaceId, TemplateKey, Name, TasksJson, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'b', N'Second', N'[]', 2, 0, N'seed', N'seed'),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'a', N'First',  N'[]', 1, 0, N'seed', N'seed'),
           (NEWID(), '2B150000-0000-4000-8000-000000000002', N'c', N'Other',  N'[]', 1, 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Rows (rn INT IDENTITY(1,1), TaskBundleTemplateId UNIQUEIDENTIFIER, TemplateKey NVARCHAR(64), Name NVARCHAR(200), TasksJson NVARCHAR(MAX), SortOrder INT);
    INSERT INTO #Rows (TaskBundleTemplateId, TemplateKey, Name, TasksJson, SortOrder)
    EXEC dbo.usp_GetTaskBundleTemplates @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — only this workspace's two templates, ordered by SortOrder.
    DECLARE @Count INT          = (SELECT COUNT(*) FROM #Rows);
    DECLARE @First NVARCHAR(200) = (SELECT Name FROM #Rows WHERE rn = 1);
    DECLARE @Second NVARCHAR(200) = (SELECT Name FROM #Rows WHERE rn = 2);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
    EXEC tSQLt.AssertEqualsString @Expected = N'First', @Actual = @First;
    EXEC tSQLt.AssertEqualsString @Expected = N'Second', @Actual = @Second;
END;
GO
