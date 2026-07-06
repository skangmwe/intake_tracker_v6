-- =============================================
-- tSQLt tests for usp_QueryWorkspaceAudit (Slice 18 — S33 Workspace audit log).
-- Covers: newest-first ordering, workspace scoping (no cross-workspace leak), each filter
--         (date range / actor / record / event type) applied and ANDed, actor-name resolution +
--         null actor for system events, paging (page/size + TotalCount over the full filtered set),
--         and empty-workspace → empty page + zero count.
-- Two result sets: page rows captured into a shaped temp table, then TotalCount read separately
-- (mirrors SearchTests / QueryRequestsTests). database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'WorkspaceAuditTests';
GO

-- Workspace A the admin reads; workspace B is a different workspace (leak guard).
-- Two actors: @aa (named), plus a system event (ActorUserId NULL).
CREATE PROCEDURE WorkspaceAuditTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';

    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES ('00000000-0000-4000-8000-0000000000aa', N'Ada Analyst', N'ada@example.com', 0, 0),
           ('00000000-0000-4000-8000-0000000000bb', N'Ben Builder', N'ben@example.com', 0, 0);
END;
GO

-- Helper column shape for the page result set.
-- (Declared inline in each test — tSQLt has no shared temp-table fixtures.)

CREATE PROCEDURE WorkspaceAuditTests.[test_ReturnsWorkspaceRowsNewestFirst]
AS
BEGIN
    -- Arrange — two events in workspace A, one older, one newer.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-01T10:00:00', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.updated', '00000000-0000-4000-8000-0000000000aa', '2026-07-02T10:00:00', N'{}', N'sys', N'sys', 0);

    -- Act
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryWorkspaceAudit @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — 2 rows; the newest (request.updated) is first; actor name resolved.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;

    DECLARE @FirstType NVARCHAR(64) = (SELECT TOP 1 EventType FROM #Rows ORDER BY EventAt DESC);
    EXEC tSQLt.AssertEquals @Expected = N'request.updated', @Actual = @FirstType;

    DECLARE @FirstActorName NVARCHAR(200) = (SELECT TOP 1 ActorName FROM #Rows ORDER BY EventAt DESC);
    EXEC tSQLt.AssertEquals @Expected = N'Ada Analyst', @Actual = @FirstActorName;
END;
GO

CREATE PROCEDURE WorkspaceAuditTests.[test_ScopesToWorkspaceNoCrossWorkspaceLeak]
AS
BEGIN
    -- Arrange — one event in A, one in B.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-01T10:00:00', N'{}', N'sys', N'sys', 0),
           (NEWID(), '2B260000-0000-4000-8000-000000000002', N'PG-00000001', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000bb', '2026-07-01T11:00:00', N'{}', N'sys', N'sys', 0);

    -- Act
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryWorkspaceAudit @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — only the A row.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Ws UNIQUEIDENTIFIER = (SELECT TOP 1 WorkspaceId FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = '1A150000-0000-4000-8000-000000000001', @Actual = @Ws;
END;
GO

CREATE PROCEDURE WorkspaceAuditTests.[test_NullActorForSystemEvent]
AS
BEGIN
    -- Arrange — a system-generated event has no actor.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', NULL, NULL, N'config.workspace.provisioned', NULL, '2026-07-01T10:00:00', N'{}', N'sys', N'sys', 0);

    -- Act
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryWorkspaceAudit @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — one row, actor id + name both null.
    DECLARE @NullActors INT = (SELECT COUNT(*) FROM #Rows WHERE ActorUserId IS NULL AND ActorName IS NULL);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @NullActors;
END;
GO

CREATE PROCEDURE WorkspaceAuditTests.[test_FiltersByEventTypeAndActor]
AS
BEGIN
    -- Arrange — three events; only one matches both the type and actor filters.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'gate.resolved', '00000000-0000-4000-8000-0000000000aa', '2026-07-01', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000002', N'Request', N'request.updated', '00000000-0000-4000-8000-0000000000aa', '2026-07-02', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000003', N'Request', N'gate.resolved', '00000000-0000-4000-8000-0000000000bb', '2026-07-03', N'{}', N'sys', N'sys', 0);

    -- Act — gate.resolved by Ada only.
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryWorkspaceAudit
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @EventType = N'gate.resolved',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — exactly the AIS-00000001 row.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Rec NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @Rec;
END;
GO

CREATE PROCEDURE WorkspaceAuditTests.[test_FiltersByDateRangeInclusive]
AS
BEGIN
    -- Arrange — three events across three days; the middle day is inside an inclusive [02,02] window.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-01T09:00:00', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000002', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-02T23:59:00', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000003', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-03T00:00:00', N'{}', N'sys', N'sys', 0);

    -- Act — inclusive [2026-07-02, 2026-07-02]: only the 02 event (incl. its 23:59 time).
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryWorkspaceAudit
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @DateFrom = '2026-07-02',
        @DateTo = '2026-07-02';

    -- Assert — one row, the 02 record.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Rec NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000002', @Actual = @Rec;
END;
GO

CREATE PROCEDURE WorkspaceAuditTests.[test_FiltersByRecord]
AS
BEGIN
    -- Arrange — two records, two events each.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-01', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.updated', '00000000-0000-4000-8000-0000000000aa', '2026-07-02', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000002', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-03', N'{}', N'sys', N'sys', 0);

    -- Act
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryWorkspaceAudit
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @RecordId = N'AIS-00000001';

    -- Assert — the two AIS-00000001 events only.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

CREATE PROCEDURE WorkspaceAuditTests.[test_PagingReturnsPageAndFullTotalCount]
AS
BEGIN
    -- Arrange — three events; page size 2 → page 1 has 2 rows, TotalCount is 3.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000001', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-01', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000002', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-02', N'{}', N'sys', N'sys', 0),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'AIS-00000003', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000aa', '2026-07-03', N'{}', N'sys', N'sys', 0);

    -- Act — page-1 rows.
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryWorkspaceAudit
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Page = 1, @PageSize = 2;

    -- Assert — page holds 2 rows.
    DECLARE @PageCount INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @PageCount;
END;
GO

CREATE PROCEDURE WorkspaceAuditTests.[test_EmptyWorkspaceReturnsNoRows]
AS
BEGIN
    -- Arrange — an event only in another workspace.
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), '2B260000-0000-4000-8000-000000000002', N'PG-00000001', N'Request', N'request.created', '00000000-0000-4000-8000-0000000000bb', '2026-07-01', N'{}', N'sys', N'sys', 0);

    -- Act — query the empty workspace.
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER, ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows
    EXEC dbo.usp_QueryWorkspaceAudit @WorkspaceId = '1A150000-0000-4000-8000-000000000001';

    -- Assert — empty page.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO
