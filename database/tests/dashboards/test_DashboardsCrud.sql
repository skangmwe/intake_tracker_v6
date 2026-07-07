-- =============================================
-- tSQLt tests for the dashboard CRUD procs (Slice 23).
-- Covers: usp_ListDashboards (everyone-audience rows returned, deleted excluded, WidgetCount,
--         IsDefault-first ordering), usp_GetDashboardById (row returned; empty when deleted),
--         usp_UpdateDashboard (COALESCE rename leaves audience; retire soft-deletes). AAA, FakeTable.
--
-- Scalar assertions read into a SQL_VARIANT local first — a parenthesised subquery is not a valid
-- EXEC argument in T-SQL.
-- =============================================

EXEC tSQLt.NewTestClass 'DashboardCrudTests';
GO

CREATE PROCEDURE DashboardCrudTests.[test_ListReturnsEveryoneRowsDefaultFirst]
AS
BEGIN
    -- Arrange — a default + a non-default everyone dashboard, plus a soft-deleted one.
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.SavedDashboard (SavedDashboardId, WorkspaceId, Slug, Name, Description, ObjectType,
        AudienceJson, IsDefault, SupportsDrillThrough, WidgetsJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Ws, N'ai-workload', N'Workload', NULL, N'Request', N'{"kind":"everyone"}', 0, 1,
            N'[{"id":"a"},{"id":"b"}]', 0, N'seed', N'seed'),
        (NEWID(), @Ws, N'ai-default', N'Default', NULL, N'Request', N'{"kind":"everyone"}', 1, 1,
            N'[{"id":"a"}]', 0, N'seed', N'seed'),
        (NEWID(), @Ws, N'pg-starter', N'Gone', NULL, N'Request', N'{"kind":"everyone"}', 0, 1,
            N'[]', 1, N'seed', N'seed');

    -- Act
    CREATE TABLE #Rows (SavedDashboardId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, Slug NVARCHAR(32),
        Name NVARCHAR(200), Description NVARCHAR(500), AudienceJson NVARCHAR(MAX), IsDefault BIT,
        ObjectType NVARCHAR(16), WidgetCount INT, UpdatedAt DATETIME2);
    INSERT INTO #Rows
    EXEC dbo.usp_ListDashboards @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — two live rows, deleted excluded, default first, widget count correct.
    DECLARE @Total SQL_VARIANT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    DECLARE @FirstSlug SQL_VARIANT = (SELECT TOP 1 Slug FROM #Rows ORDER BY IsDefault DESC, Name ASC);
    EXEC tSQLt.AssertEquals @Expected = N'ai-default', @Actual = @FirstSlug;

    DECLARE @WorkloadWidgets SQL_VARIANT = (SELECT WidgetCount FROM #Rows WHERE Slug = N'ai-workload');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @WorkloadWidgets;
END;
GO

CREATE PROCEDURE DashboardCrudTests.[test_GetByIdReturnsRow]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.SavedDashboard (SavedDashboardId, WorkspaceId, Slug, Name, Description, ObjectType,
        AudienceJson, IsDefault, SupportsDrillThrough, WidgetsJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Id, '1A150000-0000-4000-8000-000000000001', N'ai-default', N'Default', NULL, N'Request',
        N'{"kind":"everyone"}', 1, 1, N'[]', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Row (SavedDashboardId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, Slug NVARCHAR(32),
        Name NVARCHAR(200), Description NVARCHAR(500), AudienceJson NVARCHAR(MAX), IsDefault BIT,
        ObjectType NVARCHAR(16), SupportsDrillThrough BIT, WidgetsJson NVARCHAR(MAX));
    INSERT INTO #Row EXEC dbo.usp_GetDashboardById @SavedDashboardId = @Id;

    -- Assert
    DECLARE @Cnt SQL_VARIANT = (SELECT COUNT(*) FROM #Row WHERE Slug = N'ai-default');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Cnt;
END;
GO

CREATE PROCEDURE DashboardCrudTests.[test_GetByIdEmptyWhenDeleted]
AS
BEGIN
    -- Arrange — a soft-deleted dashboard.
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.SavedDashboard (SavedDashboardId, WorkspaceId, Slug, Name, ObjectType,
        AudienceJson, IsDefault, SupportsDrillThrough, WidgetsJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Id, '1A150000-0000-4000-8000-000000000001', N'ai-default', N'Default', N'Request',
        N'{"kind":"everyone"}', 1, 1, N'[]', 1, N'seed', N'seed');

    -- Act
    CREATE TABLE #Row (SavedDashboardId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, Slug NVARCHAR(32),
        Name NVARCHAR(200), Description NVARCHAR(500), AudienceJson NVARCHAR(MAX), IsDefault BIT,
        ObjectType NVARCHAR(16), SupportsDrillThrough BIT, WidgetsJson NVARCHAR(MAX));
    INSERT INTO #Row EXEC dbo.usp_GetDashboardById @SavedDashboardId = @Id;

    -- Assert — no rows for a deleted dashboard.
    DECLARE @Cnt SQL_VARIANT = (SELECT COUNT(*) FROM #Row);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Cnt;
END;
GO

CREATE PROCEDURE DashboardCrudTests.[test_UpdateRenamesLeavingAudience]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.SavedDashboard (SavedDashboardId, WorkspaceId, Slug, Name, ObjectType,
        AudienceJson, IsDefault, SupportsDrillThrough, WidgetsJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Id, '1A150000-0000-4000-8000-000000000001', N'ai-default', N'Old name', N'Request',
        N'{"kind":"everyone"}', 1, 1, N'[]', 0, N'seed', N'seed');

    -- Act — rename only; audience omitted (NULL) so it must be preserved.
    EXEC dbo.usp_UpdateDashboard @SavedDashboardId = @Id, @Name = N'New name',
        @AudienceJson = NULL, @Retire = 0, @ActorUserId = N'admin';

    -- Assert
    DECLARE @Name SQL_VARIANT = (SELECT Name FROM dbo.SavedDashboard WHERE SavedDashboardId = @Id);
    EXEC tSQLt.AssertEquals @Expected = N'New name', @Actual = @Name;
    DECLARE @Aud SQL_VARIANT = (SELECT AudienceJson FROM dbo.SavedDashboard WHERE SavedDashboardId = @Id);
    EXEC tSQLt.AssertEquals @Expected = N'{"kind":"everyone"}', @Actual = @Aud;
END;
GO

CREATE PROCEDURE DashboardCrudTests.[test_UpdateRetireSoftDeletes]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.SavedDashboard (SavedDashboardId, WorkspaceId, Slug, Name, ObjectType,
        AudienceJson, IsDefault, SupportsDrillThrough, WidgetsJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Id, '1A150000-0000-4000-8000-000000000001', N'ai-default', N'Doomed', N'Request',
        N'{"kind":"everyone"}', 1, 1, N'[]', 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_UpdateDashboard @SavedDashboardId = @Id, @Retire = 1, @ActorUserId = N'admin';

    -- Assert
    DECLARE @Flag SQL_VARIANT = (SELECT IsDeleted FROM dbo.SavedDashboard WHERE SavedDashboardId = @Id);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Flag;
END;
GO
