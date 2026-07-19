-- =============================================
-- tSQLt tests for the multi-dashboard composer (Slice 28). Covers the composed CRUD proc
-- (usp_CreateDashboard), the Personal/Shared list filter (usp_ListDashboards), the visibility +
-- widgets patch (usp_UpdateDashboard), and the three composed resolvers (KPI / breakdown / grid).
-- AAA, FakeTable, AssertEquals. Records scoped to the AI workspace 1A15…0001 unless noted.
-- =============================================

EXEC tSQLt.NewTestClass 'DashboardComposerTests';
GO

-- ── usp_CreateDashboard — composed row shape ─────────────────────────────────
CREATE PROCEDURE DashboardComposerTests.[test_CreateDashboardInsertsComposedRow]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard', @Defaults = 1;
    DECLARE @Ws    UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Actor NVARCHAR(256)    = 'AA110000-0000-4000-8000-000000000001';

    -- Act
    CREATE TABLE #Id (SavedDashboardId UNIQUEIDENTIFIER);
    INSERT INTO #Id
    EXEC dbo.usp_CreateDashboard
        @WorkspaceId = @Ws, @Name = N'Tax delivery', @Description = N'My board',
        @Visibility = N'Personal', @ObjectType = N'Request',
        @WidgetsJson = N'[]', @ActorUserId = @Actor;

    -- Assert — one composed row, no slug, correct flags.
    DECLARE @NewId UNIQUEIDENTIFIER = (SELECT SavedDashboardId FROM #Id);
    DECLARE @SlugNull SQL_VARIANT = (SELECT CASE WHEN Slug IS NULL THEN 1 ELSE 0 END FROM dbo.SavedDashboard WHERE SavedDashboardId = @NewId);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @SlugNull;
    DECLARE @Layout SQL_VARIANT = (SELECT LayoutMode FROM dbo.SavedDashboard WHERE SavedDashboardId = @NewId);
    EXEC tSQLt.AssertEquals @Expected = N'Composed', @Actual = @Layout;
    DECLARE @Vis SQL_VARIANT = (SELECT Visibility FROM dbo.SavedDashboard WHERE SavedDashboardId = @NewId);
    EXEC tSQLt.AssertEquals @Expected = N'Personal', @Actual = @Vis;
    DECLARE @Seeded SQL_VARIANT = (SELECT IsSeeded FROM dbo.SavedDashboard WHERE SavedDashboardId = @NewId);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Seeded;
END;
GO

-- ── usp_ListDashboards — Personal is author-only ─────────────────────────────
CREATE PROCEDURE DashboardComposerTests.[test_ListExcludesOthersPersonalDashboards]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @U1 UNIQUEIDENTIFIER = 'AA110000-0000-4000-8000-000000000001';
    DECLARE @U2 UNIQUEIDENTIFIER = 'BB220000-0000-4000-8000-000000000002';

    INSERT INTO dbo.SavedDashboard
        (SavedDashboardId, WorkspaceId, Slug, Name, ObjectType, AudienceJson, IsDefault,
         SupportsDrillThrough, WidgetsJson, IsSeeded, Visibility, LayoutMode, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Ws, NULL, N'Shared board',   N'Request', N'{"kind":"everyone"}', 0, 0, N'[]', 0, N'Shared',   N'Composed', CAST(@U1 AS NVARCHAR(256)), CAST(@U1 AS NVARCHAR(256))),
        (NEWID(), @Ws, NULL, N'U1 personal',     N'Request', N'{"kind":"everyone"}', 0, 0, N'[]', 0, N'Personal', N'Composed', CAST(@U1 AS NVARCHAR(256)), CAST(@U1 AS NVARCHAR(256))),
        (NEWID(), @Ws, NULL, N'U2 personal',     N'Request', N'{"kind":"everyone"}', 0, 0, N'[]', 0, N'Personal', N'Composed', CAST(@U2 AS NVARCHAR(256)), CAST(@U2 AS NVARCHAR(256)));

    -- Act — list for U1.
    CREATE TABLE #R (SavedDashboardId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, Slug NVARCHAR(32),
                     Name NVARCHAR(200), Description NVARCHAR(500), AudienceJson NVARCHAR(MAX),
                     IsDefault BIT, ObjectType NVARCHAR(16), WidgetCount INT, UpdatedAt DATETIME2,
                     IsSeeded BIT, Visibility NVARCHAR(20), LayoutMode NVARCHAR(20));
    INSERT INTO #R EXEC dbo.usp_ListDashboards @WorkspaceId = @Ws, @UserId = @U1;

    -- Assert — U1 sees the shared board + their own personal, but not U2's personal.
    DECLARE @Total SQL_VARIANT = (SELECT COUNT(*) FROM #R);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
    DECLARE @Others SQL_VARIANT = (SELECT COUNT(*) FROM #R WHERE Name = N'U2 personal');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Others;
END;
GO

-- ── usp_UpdateDashboard — visibility + widgets patch ─────────────────────────
CREATE PROCEDURE DashboardComposerTests.[test_UpdateDashboardSetsVisibilityAndWidgets]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard', @Defaults = 1;
    DECLARE @Ws  UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Id  UNIQUEIDENTIFIER = 'DD330000-0000-4000-8000-000000000001';

    INSERT INTO dbo.SavedDashboard
        (SavedDashboardId, WorkspaceId, Slug, Name, ObjectType, AudienceJson, IsDefault,
         SupportsDrillThrough, WidgetsJson, IsSeeded, Visibility, LayoutMode, CreatedBy, UpdatedBy)
    VALUES
        (@Id, @Ws, NULL, N'Board', N'Request', N'{"kind":"everyone"}', 0, 0, N'[]', 0, N'Shared', N'Composed', N's', N's');

    -- Act
    EXEC dbo.usp_UpdateDashboard
        @SavedDashboardId = @Id, @Visibility = N'Personal',
        @WidgetsJson = N'[{"id":"w1","type":"kpi-tile","title":"Open","config":{"composedMetric":"count","width":"Half","sortOrder":0}}]',
        @ActorUserId = N'actor';

    -- Assert
    DECLARE @Vis SQL_VARIANT = (SELECT Visibility FROM dbo.SavedDashboard WHERE SavedDashboardId = @Id);
    EXEC tSQLt.AssertEquals @Expected = N'Personal', @Actual = @Vis;
    DECLARE @Widgets SQL_VARIANT = (SELECT CAST((SELECT COUNT(*) FROM OPENJSON(WidgetsJson)) AS INT) FROM dbo.SavedDashboard WHERE SavedDashboardId = @Id);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Widgets;
END;
GO

-- ── usp_GetDashboardComposedKpi — the four metrics ───────────────────────────
CREATE PROCEDURE DashboardComposerTests.[test_ComposedKpiMetricsOverOpenRecords]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';
    DECLARE @Today DATE = '2026-07-19';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, DeptPgClient, AssignedAnalyst, PriorityScore, DueDate, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'build', N'Finance', N'Priya', 7, '2026-07-10', N'{}', 0, N's', N's'), -- open, assigned, high, overdue
           (N'AIS-2', @Ws, @Lc, N'build', N'Finance', NULL,     2, '2026-08-01', N'{}', 0, N's', N's'), -- open, unassigned
           (N'AIS-3', @Ws, @Lc, N'build', N'Finance', N'Priya', 6, NULL,        N'{"outcome":"Live"}', 0, N's', N's'); -- closed → excluded

    -- Act + Assert — count
    CREATE TABLE #C (Cnt INT);
    INSERT INTO #C EXEC dbo.usp_GetDashboardComposedKpi @WorkspaceId = @Ws, @Metric = N'count', @Today = @Today;
    DECLARE @Count SQL_VARIANT = (SELECT Cnt FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;

    -- unassigned
    DELETE FROM #C;
    INSERT INTO #C EXEC dbo.usp_GetDashboardComposedKpi @WorkspaceId = @Ws, @Metric = N'unassigned', @Today = @Today;
    DECLARE @Unassigned SQL_VARIANT = (SELECT Cnt FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Unassigned;

    -- overdue (due < today, open)
    DELETE FROM #C;
    INSERT INTO #C EXEC dbo.usp_GetDashboardComposedKpi @WorkspaceId = @Ws, @Metric = N'overdue', @Today = @Today;
    DECLARE @Overdue SQL_VARIANT = (SELECT Cnt FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Overdue;

    -- high-priority (score >= 5, open)
    DELETE FROM #C;
    INSERT INTO #C EXEC dbo.usp_GetDashboardComposedKpi @WorkspaceId = @Ws, @Metric = N'high-priority', @Today = @Today;
    DECLARE @High SQL_VARIANT = (SELECT Cnt FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @High;
END;
GO

-- ── usp_GetDashboardComposedKpi — dept scope filter ──────────────────────────
CREATE PROCEDURE DashboardComposerTests.[test_ComposedKpiRespectsDeptScope]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, DeptPgClient, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'build', N'Finance',    N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'build', N'Litigation', N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, @Lc, N'build', N'Finance',    N'{}', 0, N's', N's');

    -- Act — scope to Finance only.
    CREATE TABLE #C (Cnt INT);
    INSERT INTO #C EXEC dbo.usp_GetDashboardComposedKpi
        @WorkspaceId = @Ws, @Metric = N'count', @DeptsJson = N'["Finance"]';

    -- Assert
    DECLARE @Count SQL_VARIANT = (SELECT Cnt FROM #C);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

-- ── usp_GetDashboardComposedBreakdown — group by origin ──────────────────────
CREATE PROCEDURE DashboardComposerTests.[test_ComposedBreakdownByOrigin]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, DeptPgClient, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'build', N'Finance',    N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'build', N'Finance',    N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, @Lc, N'build', N'Litigation', N'{}', 0, N's', N's'),
           (N'AIS-4', @Ws, @Lc, N'build', N'Finance',    N'{"outcome":"Live"}', 0, N's', N's'); -- closed → excluded

    -- Act
    CREATE TABLE #R (Label NVARCHAR(200), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardComposedBreakdown @WorkspaceId = @Ws, @GroupBy = N'origin';

    -- Assert
    DECLARE @Fin SQL_VARIANT = (SELECT Cnt FROM #R WHERE Label = N'Finance');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Fin;
    DECLARE @Lit SQL_VARIANT = (SELECT Cnt FROM #R WHERE Label = N'Litigation');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Lit;
END;
GO

-- ── usp_GetDashboardComposedGrid — scoped page + count ───────────────────────
CREATE PROCEDURE DashboardComposerTests.[test_ComposedGridScopedRowsAndCount]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.StageDefinition (LifecycleId, StageKey, Label, StatusCategory, IsDeleted, WorkspaceId, CreatedBy, UpdatedBy)
    VALUES (@Lc, N'build', N'Build', N'Build', 0, @Ws, N's', N's');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, Name, DeptPgClient, PriorityScore, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'build', N'One',   N'Finance',    9, N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'build', N'Two',   N'Finance',    3, N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, @Lc, N'build', N'Three', N'Litigation', 5, N'{}', 0, N's', N's'), -- out of scope
           (N'AIS-4', @Ws, @Lc, N'build', N'Four',  N'Finance',    1, N'{"outcome":"Live"}', 0, N's', N's'); -- closed → excluded

    -- Act — scope to Finance, page size 1. Two result sets → capture each via ResultSetFilter
    -- (an INSERT..EXEC would try to concatenate the mismatched page + count shapes and fail).
    CREATE TABLE #Page (Id NVARCHAR(64), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200),
                        Analyst NVARCHAR(200), Priority INT, Due DATE, StatusCategory NVARCHAR(16), Closed BIT);
    INSERT INTO #Page
    EXEC tSQLt.ResultSetFilter 1,
        N'EXEC dbo.usp_GetDashboardComposedGrid @WorkspaceId=''1A150000-0000-4000-8000-000000000001'', @DeptsJson=''["Finance"]'', @Top=1';

    CREATE TABLE #Cnt (TotalCount INT);
    INSERT INTO #Cnt
    EXEC tSQLt.ResultSetFilter 2,
        N'EXEC dbo.usp_GetDashboardComposedGrid @WorkspaceId=''1A150000-0000-4000-8000-000000000001'', @DeptsJson=''["Finance"]'', @Top=1';

    -- Assert — the single page row is the highest-priority Finance record; the count is the full
    -- Finance-scoped open total (2), not the clipped page size.
    DECLARE @TopName SQL_VARIANT = (SELECT Name FROM #Page);
    EXEC tSQLt.AssertEquals @Expected = N'One', @Actual = @TopName;
    DECLARE @Rows SQL_VARIANT = (SELECT COUNT(*) FROM #Page);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Rows;
    DECLARE @Total SQL_VARIANT = (SELECT TotalCount FROM #Cnt);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
END;
GO
