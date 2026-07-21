-- =============================================
-- tSQLt tests for the dashboard metric resolvers (Slice 23). One happy-path (and, where cheap,
-- an empty/boundary) case per resolver. AAA, FakeTable, AssertEquals/AssertEqualsTable.
-- All records scoped to the AI workspace 1A15…0001 unless a metric is PG-side.
-- =============================================

EXEC tSQLt.NewTestClass 'DashboardMetricTests';
GO

-- ── #1 pipeline-by-category ──────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_PipelineByCategoryCountsOpenOnly]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.StageDefinition (LifecycleId, StageKey, Label, StatusCategory, IsDeleted, WorkspaceId, CreatedBy, UpdatedBy)
    VALUES (@Lc, N'intake', N'Intake', N'Intake', 0, @Ws, N's', N's'),
           (@Lc, N'execution',  N'Execution',  N'Execution',  0, @Ws, N's', N's');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'intake', N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'intake', N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, @Lc, N'execution',  N'{}', 0, N's', N's'),
           (N'AIS-4', @Ws, @Lc, N'execution',  N'{"outcome":"Live"}', 0, N's', N's');  -- closed → excluded

    -- Act
    CREATE TABLE #R (Category NVARCHAR(16), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardPipelineByCategory @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Intake SQL_VARIANT = (SELECT Cnt FROM #R WHERE Category = N'Intake');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Intake;
    DECLARE @Build SQL_VARIANT = (SELECT Cnt FROM #R WHERE Category = N'Execution');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Build;
END;
GO

CREATE PROCEDURE DashboardMetricTests.[test_PipelineEmptyWhenNoRecords]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;

    -- Act
    CREATE TABLE #R (Category NVARCHAR(16), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardPipelineByCategory @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Cnt SQL_VARIANT = (SELECT COUNT(*) FROM #R);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Cnt;
END;
GO

-- ── #2 escalations-by-quarter ────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_EscalationsByQuarterThisQuarter]
AS
BEGIN
    -- Arrange — two AI-side records with escalation snapshots dated now (this quarter).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.RequestCrossingSnapshot', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, DeptPgClient, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'LIT-1', @Ws, @Lc, N'intake', N'Litigation', N'{}', 0, N's', N's'),
           (N'LIT-2', @Ws, @Lc, N'intake', N'Litigation', N'{}', 0, N's', N's');

    INSERT INTO dbo.RequestCrossingSnapshot (RecordId, WorkspaceId, FieldKey, SnapshotValue, SnapshotAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'LIT-1', N'9C700000-0000-4000-8000-000000000001', N'deptPgClient', N'"Litigation"', SYSUTCDATETIME(), 0, N's', N's'),
           (N'LIT-2', N'9C700000-0000-4000-8000-000000000001', N'deptPgClient', N'"Litigation"', SYSUTCDATETIME(), 0, N's', N's');

    -- Act
    CREATE TABLE #R (Origin NVARCHAR(200), ThisCnt INT, PriorCnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardEscalationsByQuarter @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @This SQL_VARIANT = (SELECT ThisCnt FROM #R WHERE Origin = N'Litigation');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @This;
END;
GO

-- ── #3 unassigned-past-intake ────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_UnassignedPastIntakeGrouped]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.StageDefinition (LifecycleId, StageKey, Label, StatusCategory, IsDeleted, WorkspaceId, CreatedBy, UpdatedBy)
    VALUES (@Lc, N'intake', N'Intake', N'Intake', 0, @Ws, N's', N's'),
           (@Lc, N'execution',  N'Execution',  N'Execution',  0, @Ws, N's', N's');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, DeptPgClient, AssignedAnalyst, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'execution',  N'Finance', NULL,        N'{}', 0, N's', N's'), -- past-intake, unassigned
           (N'AIS-2', @Ws, @Lc, N'execution',  N'Finance', N'—',        N'{}', 0, N's', N's'), -- em-dash = unassigned
           (N'AIS-3', @Ws, @Lc, N'execution',  N'Finance', N'Priya',    N'{}', 0, N's', N's'), -- assigned → excluded
           (N'AIS-4', @Ws, @Lc, N'intake', N'Finance', NULL,        N'{}', 0, N's', N's'); -- intake → excluded

    -- Act
    CREATE TABLE #R (Origin NVARCHAR(200), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardUnassigned @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Finance SQL_VARIANT = (SELECT Cnt FROM #R WHERE Origin = N'Finance');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Finance;
END;
GO

-- ── #4 closures-by-outcome ───────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_ClosuresByOutcomeThisQuarter]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, FieldValues, UpdatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'delivery', N'{"outcome":"Live"}',     SYSUTCDATETIME(), 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'delivery', N'{"outcome":"Declined"}', SYSUTCDATETIME(), 0, N's', N's'),
           (N'AIS-3', @Ws, @Lc, N'delivery', N'{"outcome":"Live"}',     DATEADD(DAY, -200, SYSUTCDATETIME()), 0, N's', N's'), -- prior quarter
           (N'AIS-4', @Ws, @Lc, N'delivery', N'{}',                     SYSUTCDATETIME(), 0, N's', N's');                     -- open

    -- Act
    CREATE TABLE #R (Outcome NVARCHAR(32), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardClosuresByOutcome @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — only this-quarter closures; the 200-day-old Live is excluded.
    DECLARE @Live SQL_VARIANT = (SELECT Cnt FROM #R WHERE Outcome = N'Live');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Live;
    DECLARE @Declined SQL_VARIANT = (SELECT Cnt FROM #R WHERE Outcome = N'Declined');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Declined;
END;
GO

-- ── #5 origin-by-status-heatmap ──────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_HeatmapOpenAndClosedCells]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.StageDefinition', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.StageDefinition (LifecycleId, StageKey, Label, StatusCategory, IsDeleted, WorkspaceId, CreatedBy, UpdatedBy)
    VALUES (@Lc, N'intake', N'Intake', N'Intake', 0, @Ws, N's', N's');

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, DeptPgClient, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'intake', N'Litigation', N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'intake', N'Litigation', N'{"outcome":"Live"}', 0, N's', N's');

    -- Act
    CREATE TABLE #R (Origin NVARCHAR(200), ColKey NVARCHAR(32), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardOriginStatusHeatmap @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — an open Intake cell and a closed Live cell for Litigation.
    DECLARE @Open SQL_VARIANT = (SELECT Cnt FROM #R WHERE Origin = N'Litigation' AND ColKey = N'Intake');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Open;
    DECLARE @Closed SQL_VARIANT = (SELECT Cnt FROM #R WHERE Origin = N'Litigation' AND ColKey = N'Live');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Closed;
END;
GO

-- ── #6 open-per-analyst ──────────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_OpenPerAnalyst]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, AssignedAnalyst, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'execution', N'Priya', N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'execution', N'Priya', N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, @Lc, N'execution', N'Priya', N'{"outcome":"Live"}', 0, N's', N's'), -- closed → excluded
           (N'AIS-4', @Ws, @Lc, N'execution', NULL,     N'{}', 0, N's', N's');                 -- unassigned → excluded

    -- Act
    CREATE TABLE #R (Analyst NVARCHAR(200), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardOpenPerAnalyst @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Priya SQL_VARIANT = (SELECT Cnt FROM #R WHERE Analyst = N'Priya');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Priya;
END;
GO

-- ── #7 pending-signoff ───────────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_PendingSignoff]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.ApprovalRequests', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'execution', N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, @Lc, N'execution', N'{}', 0, N's', N's');

    INSERT INTO dbo.ApprovalRequests (RequestRecordId, WorkspaceId, State, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, N'Pending', 0, N's', N's'),
           (N'AIS-2', @Ws, N'Resolved', 0, N's', N's'); -- resolved → not pending

    -- Act
    CREATE TABLE #R (Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardPendingSignoff @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Cnt SQL_VARIANT = (SELECT Cnt FROM #R);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Cnt;
END;
GO

-- ── #8 median-time-to-triage ─────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_MedianTimeToTriageCurrentWindow]
AS
BEGIN
    -- Arrange — one assigned record created 5 days ago, stage entered now → 5-day triage.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, AssignedAnalyst, CreatedAt, StageEnteredAt, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'execution', N'Priya', DATEADD(DAY, -5, SYSUTCDATETIME()), SYSUTCDATETIME(), N'{}', 0, N's', N's');

    -- Act
    CREATE TABLE #R (MedianDays FLOAT, PriorMedianDays FLOAT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardMedianTimeToTriage @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @WindowDays = 30;

    -- Assert
    DECLARE @Median SQL_VARIANT = (SELECT MedianDays FROM #R);
    EXEC tSQLt.AssertEquals @Expected = 5.0, @Actual = @Median;
END;
GO

-- ── #9 aging-in-stage ────────────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_AgingBuckets]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, StageEnteredAt, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, @Lc, N'execution', DATEADD(DAY,  -1, SYSUTCDATETIME()), N'{}', 0, N's', N's'), -- 0–2
           (N'AIS-2', @Ws, @Lc, N'execution', DATEADD(DAY, -10, SYSUTCDATETIME()), N'{}', 0, N's', N's'), -- 8–14
           (N'AIS-3', @Ws, @Lc, N'execution', DATEADD(DAY, -40, SYSUTCDATETIME()), N'{}', 0, N's', N's'); -- 30+

    -- Act
    CREATE TABLE #R (Bucket NVARCHAR(16), SortOrder INT, Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardAgingInStage @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @B1 SQL_VARIANT = (SELECT Cnt FROM #R WHERE SortOrder = 1);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @B1;
    DECLARE @B5 SQL_VARIANT = (SELECT Cnt FROM #R WHERE SortOrder = 5);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @B5;
END;
GO

-- ── #10 features-published ───────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_FeaturesPublished]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, N'A', N'Published', N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, N'B', N'Published', N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, N'C', N'Draft',     N'{}', 0, N's', N's');

    -- Act
    CREATE TABLE #R (Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardFeaturesPublished @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Cnt SQL_VARIANT = (SELECT Cnt FROM #R);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Cnt;
END;
GO

-- ── #11 features-by-type ─────────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_FeaturesByType]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FeatureType, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, N'A', N'Published', N'Extractor', N'{}', 0, N's', N's'),
           (N'AIS-2', @Ws, N'B', N'Published', N'Extractor', N'{}', 0, N's', N's'),
           (N'AIS-3', @Ws, N'C', N'Draft',     N'Extractor', N'{}', 0, N's', N's'); -- draft excluded

    -- Act
    CREATE TABLE #R (TypeLabel NVARCHAR(64), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardFeaturesByType @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Cnt SQL_VARIANT = (SELECT Cnt FROM #R WHERE TypeLabel = N'Extractor');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Cnt;
END;
GO

-- ── #12 features-by-tech (multi-value split) ─────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_FeaturesByTechSplitsArray]
AS
BEGIN
    -- Arrange — one published feature on two stacks; each stack gets a count.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-1', @Ws, N'A', N'Published', N'{"techStack":["Python","Azure"]}', 0, N's', N's'),
           (N'AIS-2', @Ws, N'B', N'Published', N'{"techStack":["Python"]}',         0, N's', N's');

    -- Act
    CREATE TABLE #R (TechLabel NVARCHAR(128), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardFeaturesByTech @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Python SQL_VARIANT = (SELECT Cnt FROM #R WHERE TechLabel = N'Python');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Python;
    DECLARE @Azure SQL_VARIANT = (SELECT Cnt FROM #R WHERE TechLabel = N'Azure');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Azure;
END;
GO

-- ── #13 requests-by-origin ───────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_RequestsByOriginIncludesUnset]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '9C700000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, DeptPgClient, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'PG-1', @Ws, @Lc, N'intake', N'Litigation', N'{}', 0, N's', N's'),
           (N'PG-2', @Ws, @Lc, N'intake', N'Litigation', N'{}', 0, N's', N's'),
           (N'PG-3', @Ws, @Lc, N'intake', NULL,          N'{}', 0, N's', N's'); -- unset origin

    -- Act
    CREATE TABLE #R (Origin NVARCHAR(200), Cnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardRequestsByOrigin @WorkspaceId = '9C700000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Lit SQL_VARIANT = (SELECT Cnt FROM #R WHERE Origin = N'Litigation');
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Lit;
    DECLARE @Unset SQL_VARIANT = (SELECT Cnt FROM #R WHERE Origin = N'— (unset)');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Unset;
END;
GO

-- ── #14 escalation-status ────────────────────────────────────────────────────
CREATE PROCEDURE DashboardMetricTests.[test_EscalationStatusSetVsBlank]
AS
BEGIN
    -- Arrange — 3 PG records; one has an escalation snapshot on this side.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.RequestCrossingSnapshot', @Defaults = 1;
    DECLARE @Ws UNIQUEIDENTIFIER = '9C700000-0000-4000-8000-000000000001';
    DECLARE @Lc UNIQUEIDENTIFIER = 'C1FE0000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'PG-1', @Ws, @Lc, N'intake', N'{}', 0, N's', N's'),
           (N'PG-2', @Ws, @Lc, N'intake', N'{}', 0, N's', N's'),
           (N'PG-3', @Ws, @Lc, N'intake', N'{}', 0, N's', N's');

    INSERT INTO dbo.RequestCrossingSnapshot (RecordId, WorkspaceId, FieldKey, SnapshotValue, SnapshotAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'PG-1', @Ws, N'deptPgClient', N'"Litigation"', SYSUTCDATETIME(), 0, N's', N's');

    -- Act
    CREATE TABLE #R (SetCnt INT, BlankCnt INT);
    INSERT INTO #R EXEC dbo.usp_GetDashboardEscalationStatus @WorkspaceId = '9C700000-0000-4000-8000-000000000001';

    -- Assert
    DECLARE @Set SQL_VARIANT = (SELECT SetCnt FROM #R);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Set;
    DECLARE @Blank SQL_VARIANT = (SELECT BlankCnt FROM #R);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Blank;
END;
GO
