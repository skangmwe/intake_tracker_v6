-- =============================================
-- tSQLt tests for dbo.usp_GetTasksForWorkspace (Task export read).
-- Covers: returns a workspace's tasks with the assignee display name (LEFT JOIN so an
-- unassigned task still exports), resolves the creator's display name via TRY_CAST on the
-- audit actor id, surfaces the captured typed field (label + coalesced value), excludes
-- soft-deleted tasks, excludes other workspaces' tasks, and paginates via OFFSET/FETCH.
-- database-testing.md (AAA, FakeTable, AssertEquals — assign to a local, never inline @Actual=(SELECT)).
-- =============================================

EXEC tSQLt.NewTestClass 'GetTasksForWorkspaceTests';
GO

CREATE PROCEDURE GetTasksForWorkspaceTests.[test_ReturnsWorkspaceTasksWithAssigneeName_ExcludesForeignAndDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';
    DECLARE @User    UNIQUEIDENTIFIER = '2B000000-0000-4000-8000-000000000001';
    DECLARE @Creator UNIQUEIDENTIFIER = '2B000000-0000-4000-8000-000000000002';
    DECLARE @Task1   UNIQUEIDENTIFIER = '3C000000-0000-4000-8000-000000000001';
    DECLARE @Task2   UNIQUEIDENTIFIER = '3C000000-0000-4000-8000-000000000002';

    INSERT INTO dbo.Users (UserId, DisplayName, IsDeleted)
    VALUES
        (@User,    N'Alex Chen',  0),
        (@Creator, N'Robin Diaz', 0);

    -- Task1 is assigned + carries a captured typed field (select) + a GUID creator; Task2 is
    -- unassigned, unfielded, and seeded ('system-seed' → creator name resolves to null via TRY_CAST).
    INSERT INTO dbo.Tasks
        (TaskId, RecordId, WorkspaceId, Title, Phase, AssigneeUserId, Status, Notes, CompletedAt,
         SortOrder, IsDeleted, CreatedBy, FieldLabel, FieldType, FieldValueSelect)
    VALUES
        (@Task1, N'LIT-9004', @Ws,      N'Draft brief',  N'Build', @User, N'Open', N'note-a', NULL, 1, 0,
            CONVERT(NVARCHAR(36), @Creator), N'Environment', N'select', N'Production'), -- included, assigned + fielded
        (@Task2, N'LIT-9004', @Ws,      N'Review',       N'QA',    NULL,  N'Done', NULL,     NULL, 2, 0,
            N'system-seed', NULL, NULL, NULL),                                          -- included, unassigned + seeded
        (NEWID(), N'LIT-9004', @Ws,     N'Deleted task', N'Build', @User, N'Open', NULL,     NULL, 3, 1,
            N'system-seed', NULL, NULL, NULL),                                          -- soft-deleted — excluded
        (NEWID(), N'FIN-2210', @OtherWs,N'Foreign task', N'Build', @User, N'Open', NULL,     NULL, 1, 0,
            N'system-seed', NULL, NULL, NULL);                                          -- other workspace — excluded

    -- Act
    CREATE TABLE #Actual (TaskId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), Title NVARCHAR(400), Phase NVARCHAR(32),
        Status NVARCHAR(16), Notes NVARCHAR(MAX), CompletedAt DATETIME2, CreatedAt DATETIME2,
        AssigneeUserId UNIQUEIDENTIFIER, AssigneeName NVARCHAR(200), CreatedByName NVARCHAR(200),
        FieldLabel NVARCHAR(200), FieldValue NVARCHAR(MAX));
    INSERT INTO #Actual EXEC dbo.usp_GetTasksForWorkspace @WorkspaceId = @Ws, @Page = 1, @PageSize = 100;

    -- Assert — only the two live tasks in this workspace are returned.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    -- The assigned task carries the joined assignee name.
    DECLARE @Name NVARCHAR(200) = (SELECT AssigneeName FROM #Actual WHERE TaskId = @Task1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Alex Chen', @Actual = @Name;

    -- The creator's display name resolves via TRY_CAST on the audit actor id.
    DECLARE @Creator1 NVARCHAR(200) = (SELECT CreatedByName FROM #Actual WHERE TaskId = @Task1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Robin Diaz', @Actual = @Creator1;

    -- The captured typed field surfaces (label + coalesced value from the select column).
    DECLARE @Label NVARCHAR(200) = (SELECT FieldLabel FROM #Actual WHERE TaskId = @Task1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Environment', @Actual = @Label;

    DECLARE @Value NVARCHAR(MAX) = (SELECT FieldValue FROM #Actual WHERE TaskId = @Task1);
    EXEC tSQLt.AssertEqualsString @Expected = N'Production', @Actual = @Value;

    -- The unassigned task still exports, with a null assignee name (LEFT JOIN).
    DECLARE @UnassignedName INT = (SELECT COUNT(*) FROM #Actual WHERE TaskId = @Task2 AND AssigneeName IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @UnassignedName;

    -- The seeded task's non-GUID actor resolves to a null creator name (TRY_CAST returns null).
    DECLARE @SeededCreator INT = (SELECT COUNT(*) FROM #Actual WHERE TaskId = @Task2 AND CreatedByName IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @SeededCreator;

    -- The foreign-workspace task did not leak in.
    DECLARE @Foreign INT = (SELECT COUNT(*) FROM #Actual WHERE RecordId = N'FIN-2210');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Foreign;
END;
GO

CREATE PROCEDURE GetTasksForWorkspaceTests.[test_Paginates_SecondPageReturnsNextTask]
AS
BEGIN
    -- Arrange — three tasks in one record; page size 2 → page 2 holds exactly the third.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Tasks';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Tasks (TaskId, RecordId, WorkspaceId, Title, Phase, AssigneeUserId, Status, Notes, CompletedAt, SortOrder, IsDeleted, CreatedBy)
    VALUES
        (NEWID(), N'LIT-9004', @Ws, N'First',  N'Build', NULL, N'Open', NULL, NULL, 1, 0, N'system-seed'),
        (NEWID(), N'LIT-9004', @Ws, N'Second', N'Build', NULL, N'Open', NULL, NULL, 2, 0, N'system-seed'),
        (NEWID(), N'LIT-9004', @Ws, N'Third',  N'Build', NULL, N'Open', NULL, NULL, 3, 0, N'system-seed');

    -- Act
    CREATE TABLE #Actual (TaskId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), Title NVARCHAR(400), Phase NVARCHAR(32),
        Status NVARCHAR(16), Notes NVARCHAR(MAX), CompletedAt DATETIME2, CreatedAt DATETIME2,
        AssigneeUserId UNIQUEIDENTIFIER, AssigneeName NVARCHAR(200), CreatedByName NVARCHAR(200),
        FieldLabel NVARCHAR(200), FieldValue NVARCHAR(MAX));
    INSERT INTO #Actual EXEC dbo.usp_GetTasksForWorkspace @WorkspaceId = @Ws, @Page = 2, @PageSize = 2;

    -- Assert — page 2 holds exactly the third task by sort order.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Total;

    DECLARE @Title NVARCHAR(400) = (SELECT Title FROM #Actual);
    EXEC tSQLt.AssertEqualsString @Expected = N'Third', @Actual = @Title;
END;
GO
