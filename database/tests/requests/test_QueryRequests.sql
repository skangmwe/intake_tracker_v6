-- =============================================
-- tSQLt tests for dbo.usp_QueryRequests (Slice 5 — Requests list).
-- Covers: workspace scoping + soft-delete exclusion, stage filter, name-contains filter,
--         priority comparator, and pagination. FakeTable (default) turns the persisted
--         computed columns into settable columns, so filter values are set directly.
-- =============================================

EXEC tSQLt.NewTestClass 'QueryRequestsTests';
GO

CREATE PROCEDURE QueryRequestsTests.SeedRows
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Description, Stage, Origin,
                              DeptPgClient, AssignedAnalyst, DueDate, PriorityScore, Submitted, RowVer, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
         N'Meeting notes extraction', N'd', N'intake', N'AI Solutions', N'Litigation', N'Priya Raman', '2026-07-10', 5, SYSUTCDATETIME(), 0x01, 0, N's', N's'),
        (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
         N'Clause library search', N'd', N'build', N'AI Solutions', N'Tax', N'M. Chen', '2026-07-20', 8, SYSUTCDATETIME(), 0x02, 0, N's', N's'),
        (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
         N'Deleted row', N'd', N'intake', N'AI Solutions', N'Litigation', NULL, '2026-07-05', 3, SYSUTCDATETIME(), 0x03, 1, N's', N's'),
        (N'TMPL-00000001', '2B260000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333',
         N'Other workspace', N'd', N'intake', N'Template', N'PG', NULL, '2026-07-05', 2, SYSUTCDATETIME(), 0x04, 0, N's', N's');
END;
GO

CREATE PROCEDURE QueryRequestsTests.[test_ScopesToWorkspaceAndExcludesDeleted]
AS
BEGIN
    -- Arrange
    EXEC QueryRequestsTests.SeedRows;

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Description NVARCHAR(MAX), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), DeptPgClient NVARCHAR(200), AssignedAnalyst NVARCHAR(200),
                        DueDate DATE, PriorityScore INT, Submitted DATETIME2, UpdatedAt DATETIME2, RowVer VARBINARY(8));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryRequests @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @Page = 1, @PageSize = 25, @FiltersJson = NULL, @SortColumn = N'id', @SortDir = N'asc';

    -- Assert — 2 live rows in the AI workspace (deleted + other-workspace excluded).
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = (SELECT COUNT(*) FROM #Rows);
END;
GO

CREATE PROCEDURE QueryRequestsTests.[test_StageFilterMatches]
AS
BEGIN
    -- Arrange
    EXEC QueryRequestsTests.SeedRows;

    -- Act — filter to stage 'build' only.
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Description NVARCHAR(MAX), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), DeptPgClient NVARCHAR(200), AssignedAnalyst NVARCHAR(200),
                        DueDate DATE, PriorityScore INT, Submitted DATETIME2, UpdatedAt DATETIME2, RowVer VARBINARY(8));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryRequests @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @Page = 1, @PageSize = 25, @FiltersJson = N'{"stage":["build"]}', @SortColumn = N'id', @SortDir = N'asc';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000002', @Actual = (SELECT TOP 1 RecordId FROM #Rows);
END;
GO

CREATE PROCEDURE QueryRequestsTests.[test_NameContainsFilter]
AS
BEGIN
    -- Arrange
    EXEC QueryRequestsTests.SeedRows;

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Description NVARCHAR(MAX), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), DeptPgClient NVARCHAR(200), AssignedAnalyst NVARCHAR(200),
                        DueDate DATE, PriorityScore INT, Submitted DATETIME2, UpdatedAt DATETIME2, RowVer VARBINARY(8));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryRequests @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @Page = 1, @PageSize = 25, @FiltersJson = N'{"nameContains":"clause"}', @SortColumn = N'id', @SortDir = N'asc';

    -- Assert — case-insensitive substring on Name.
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000002', @Actual = (SELECT TOP 1 RecordId FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
END;
GO

CREATE PROCEDURE QueryRequestsTests.[test_PriorityComparatorFilter]
AS
BEGIN
    -- Arrange
    EXEC QueryRequestsTests.SeedRows;

    -- Act — priority > 5 → only the score-8 row.
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Description NVARCHAR(MAX), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), DeptPgClient NVARCHAR(200), AssignedAnalyst NVARCHAR(200),
                        DueDate DATE, PriorityScore INT, Submitted DATETIME2, UpdatedAt DATETIME2, RowVer VARBINARY(8));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryRequests @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @Page = 1, @PageSize = 25, @FiltersJson = N'{"priorityOp":">","priorityValue":5}', @SortColumn = N'id', @SortDir = N'asc';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000002', @Actual = (SELECT TOP 1 RecordId FROM #Rows);
END;
GO

CREATE PROCEDURE QueryRequestsTests.[test_PaginationClampsPageSize]
AS
BEGIN
    -- Arrange
    EXEC QueryRequestsTests.SeedRows;

    -- Act — page 1 with size 1 returns a single row of the two live AI-workspace rows.
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Description NVARCHAR(MAX), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), DeptPgClient NVARCHAR(200), AssignedAnalyst NVARCHAR(200),
                        DueDate DATE, PriorityScore INT, Submitted DATETIME2, UpdatedAt DATETIME2, RowVer VARBINARY(8));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryRequests @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @Page = 1, @PageSize = 1, @FiltersJson = NULL, @SortColumn = N'id', @SortDir = N'asc';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = (SELECT TOP 1 RecordId FROM #Rows);
END;
GO
