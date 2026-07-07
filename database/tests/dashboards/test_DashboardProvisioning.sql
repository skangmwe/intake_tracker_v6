-- =============================================
-- tSQLt test for the dashboard-clone extension to dbo.usp_ProvisionWorkspace (Slice 23, §4).
-- A new PG workspace must receive a copy of every template SavedDashboard (the pg-starter),
-- with a fresh id and WidgetsJson copied verbatim. AAA, FakeTable.
-- =============================================

EXEC tSQLt.NewTestClass 'DashboardProvisioningTests';
GO

CREATE PROCEDURE DashboardProvisioningTests.[SetUp]
AS
BEGIN
    -- Fake every table usp_ProvisionWorkspace touches, including the new SavedDashboard clone target.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedDashboard';
END;
GO

CREATE PROCEDURE DashboardProvisioningTests.[test_ClonesTemplateDashboardsIntoNewWorkspace]
AS
BEGIN
    -- Arrange — template workspace + active admin + a template pg-starter dashboard.
    DECLARE @Template UNIQUEIDENTIFIER = NEWID();
    DECLARE @Admin    UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, IsDeleted)
    VALUES (@Template, N'PG / Department Template', N'pg-dept-template', N'TMPL', 0, 0);
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES (@Admin, N'Ada Admin', N'ada@firm.example', 0, 0);
    INSERT INTO dbo.SavedDashboard (SavedDashboardId, WorkspaceId, Slug, Name, ObjectType, AudienceJson,
        IsDefault, SupportsDrillThrough, WidgetsJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @Template, N'pg-starter', N'Practice group starter', N'Request', N'{"kind":"everyone"}',
        1, 1, N'[{"id":"grid","type":"records-grid","config":{"metric":"records-grid"}}]', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #New (WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200), Kind NVARCHAR(32), Prefix NVARCHAR(16));
    INSERT INTO #New EXEC dbo.usp_ProvisionWorkspace
        @Name = N'Litigation', @Prefix = N'lit', @InitialAdminUserId = @Admin, @ActorUserId = N'actor';
    DECLARE @NewWs UNIQUEIDENTIFIER = (SELECT WorkspaceId FROM #New);

    -- Assert — a pg-starter dashboard now exists on the new workspace (a fresh clone, not the template).
    DECLARE @Cloned SQL_VARIANT =
        (SELECT COUNT(*) FROM dbo.SavedDashboard WHERE WorkspaceId = @NewWs AND Slug = N'pg-starter' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Cloned;

    -- The clone carries the widgets verbatim and a distinct id from the template row.
    DECLARE @Widgets SQL_VARIANT = (SELECT WidgetsJson FROM dbo.SavedDashboard WHERE WorkspaceId = @NewWs);
    EXEC tSQLt.AssertEquals
        @Expected = N'[{"id":"grid","type":"records-grid","config":{"metric":"records-grid"}}]',
        @Actual = @Widgets;
    DECLARE @DistinctIds SQL_VARIANT = (SELECT COUNT(DISTINCT SavedDashboardId) FROM dbo.SavedDashboard);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @DistinctIds;  -- template + clone
END;
GO
