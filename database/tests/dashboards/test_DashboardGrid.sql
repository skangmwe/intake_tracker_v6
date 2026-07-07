-- =============================================
-- tSQLt tests for the two-result-set grid resolvers (Slice 23): usp_GetDashboardRecordsGrid and
-- usp_GetDashboardFeatureGrid. Because these procs return TWO result sets, each set is captured
-- individually via tSQLt.ResultSetFilter (@ResultsetNo, @Command) — an INSERT..EXEC would try to
-- concatenate mismatched shapes and fail. AAA, FakeTable.
-- =============================================

EXEC tSQLt.NewTestClass 'DashboardGridTests';
GO

CREATE PROCEDURE DashboardGridTests.[test_RecordsGridNoDrillReturnsOpenOnly]
AS
BEGIN
    -- Arrange — 2 open + 1 closed request.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.StageDefinition (LifecycleId, StageKey, Label, StatusCategory, IsDeleted, WorkspaceId, CreatedBy, UpdatedBy)
    VALUES (@Lc, N'build', N'Build', N'Build', 0, @Ws, N's', N's');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, DeptPgClient, PriorityScore, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'Open one', N'build', N'Finance', 5, N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'Open two', N'build', N'Finance', 3, N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, @Lc, N'Closed',   N'build', N'Finance', 1, N'{"outcome":"Live"}', 0, N's', N's');

    -- Act — capture the page (result set 1).
    CREATE TABLE #Page (Id NVARCHAR(64), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200),
        Analyst NVARCHAR(200), Priority INT, Due DATE, StatusCategory NVARCHAR(16), Closed BIT);
    INSERT INTO #Page
    EXEC tSQLt.ResultSetFilter 1,
        N'EXEC dbo.usp_GetDashboardRecordsGrid @WorkspaceId=''1A150000-0000-4000-8000-000000000001'', @DrillJson=NULL, @Top=50';

    -- Assert — only the 2 open records, ordered by priority.
    DECLARE @Cnt SQL_VARIANT = (SELECT COUNT(*) FROM #Page);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Cnt;
    DECLARE @Top SQL_VARIANT = (SELECT TOP 1 Id FROM #Page ORDER BY Priority DESC, Id ASC);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-1', @Actual = @Top;
    DECLARE @ClosedPresent SQL_VARIANT = (SELECT COUNT(*) FROM #Page WHERE Closed = 1);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @ClosedPresent;
END;
GO

CREATE PROCEDURE DashboardGridTests.[test_RecordsGridOutcomeDrillReturnsClosed]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.StageDefinition (LifecycleId, StageKey, Label, StatusCategory, IsDeleted, WorkspaceId, CreatedBy, UpdatedBy)
    VALUES (@Lc, N'deploy', N'Deploy', N'Deploy', 0, @Ws, N's', N's');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, DeptPgClient, PriorityScore, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'Open',       N'deploy', N'Finance', 5, N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'Live closed',N'deploy', N'Finance', 3, N'{"outcome":"Live"}', 0, N's', N's');

    -- Act — outcome drill on Live.
    CREATE TABLE #Page (Id NVARCHAR(64), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200),
        Analyst NVARCHAR(200), Priority INT, Due DATE, StatusCategory NVARCHAR(16), Closed BIT);
    INSERT INTO #Page
    EXEC tSQLt.ResultSetFilter 1,
        N'EXEC dbo.usp_GetDashboardRecordsGrid @WorkspaceId=''1A150000-0000-4000-8000-000000000001'', @DrillJson=''{"type":"outcome","value":"Live"}'', @Top=50';

    -- Assert — only the closed Live record, rendered with a Closed flag and 'Closed · Live' stage.
    DECLARE @Cnt SQL_VARIANT = (SELECT COUNT(*) FROM #Page);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Cnt;
    DECLARE @Stage SQL_VARIANT = (SELECT Stage FROM #Page WHERE Id = N'AIS-2');
    EXEC tSQLt.AssertEquals @Expected = N'Closed · Live', @Actual = @Stage;
    DECLARE @Flag SQL_VARIANT = (SELECT Closed FROM #Page WHERE Id = N'AIS-2');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Flag;
END;
GO

CREATE PROCEDURE DashboardGridTests.[test_RecordsGridTotalCount]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.StageDefinition (LifecycleId, StageKey, Label, StatusCategory, IsDeleted, WorkspaceId, CreatedBy, UpdatedBy)
    VALUES (@Lc, N'build', N'Build', N'Build', 0, @Ws, N's', N's');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, PriorityScore, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'A', N'build', 5, N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'B', N'build', 4, N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, @Lc, N'C', N'build', 3, N'{}', 0, N's', N's');

    -- Act — capture the count (result set 2), @Top=2 must not clip the total.
    CREATE TABLE #Cnt (TotalCount INT);
    INSERT INTO #Cnt
    EXEC tSQLt.ResultSetFilter 2,
        N'EXEC dbo.usp_GetDashboardRecordsGrid @WorkspaceId=''1A150000-0000-4000-8000-000000000001'', @DrillJson=NULL, @Top=2';

    -- Assert
    DECLARE @Total SQL_VARIANT = (SELECT TotalCount FROM #Cnt);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Total;
END;
GO

CREATE PROCEDURE DashboardGridTests.[test_FeatureGridPublishedOnly]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FeatureType, OwnerUserId, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, N'Alpha', N'Published', N'Extractor', N'Priya', N'{"techStack":["Python","Azure"]}', 0, N's', N's'),
           (N'AIS-2', @Ws, N'Beta',  N'Draft',     N'Extractor', N'Priya', N'{}', 0, N's', N's');

    -- Act — page (result set 1).
    CREATE TABLE #Page (Id NVARCHAR(64), Name NVARCHAR(400), FeatureType NVARCHAR(64), Tech NVARCHAR(128),
        Owner NVARCHAR(200), Maturity NVARCHAR(32));
    INSERT INTO #Page
    EXEC tSQLt.ResultSetFilter 1,
        N'EXEC dbo.usp_GetDashboardFeatureGrid @WorkspaceId=''1A150000-0000-4000-8000-000000000001'', @Top=50';

    -- Assert — only the Published feature, with its tech stack joined.
    DECLARE @Cnt SQL_VARIANT = (SELECT COUNT(*) FROM #Page);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Cnt;
    DECLARE @Tech SQL_VARIANT = (SELECT Tech FROM #Page WHERE Id = N'AIS-1');
    EXEC tSQLt.AssertEquals @Expected = N'Python, Azure', @Actual = @Tech;
END;
GO
