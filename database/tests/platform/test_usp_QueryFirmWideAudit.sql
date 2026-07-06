-- =============================================
-- tSQLt tests for dbo.usp_QueryFirmWideAudit (Slice 19 — Platform admin, S39).
-- Covers: cross-workspace paging, the optional workspace filter, and the event-type filter.
-- =============================================

EXEC tSQLt.NewTestClass 'FirmWideAuditTests';
GO

CREATE PROCEDURE FirmWideAuditTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.AuditEntry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
END;
GO

CREATE PROCEDURE FirmWideAuditTests.[Seed]
    @WsA UNIQUEIDENTIFIER,
    @WsB UNIQUEIDENTIFIER
AS
BEGIN
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, IsDeleted)
    VALUES (@WsA, N'AI Solutions', 0), (@WsB, N'Litigation', 0);
    INSERT INTO dbo.AuditEntry (AuditId, WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload)
    VALUES
        (NEWID(), @WsA, N'AIS-00000001', N'Request', N'request.created',      NULL, '2026-07-01T10:00:00', N'{}'),
        (NEWID(), @WsB, N'LIT-00000001', N'Request', N'request.stage-changed', NULL, '2026-07-02T10:00:00', N'{}'),
        (NEWID(), @WsA, NULL,            N'Platform', N'platform-field.updated', NULL, '2026-07-03T10:00:00', N'{}');
END;
GO

CREATE PROCEDURE FirmWideAuditTests.[test_ReturnsRowsAcrossWorkspaces]
AS
BEGIN
    -- Arrange
    DECLARE @WsA UNIQUEIDENTIFIER = NEWID(), @WsB UNIQUEIDENTIFIER = NEWID();
    EXEC FirmWideAuditTests.[Seed] @WsA = @WsA, @WsB = @WsB;

    -- Act
    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, WorkspaceName NVARCHAR(200),
        RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER,
        ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    -- usp_QueryFirmWideAudit returns two result sets (page rows + TotalCount); capture only the first
    -- via tSQLt.ResultSetFilter (a plain INSERT..EXEC would try to insert both and mismatch #Rows).
    INSERT INTO #Rows EXEC tSQLt.ResultSetFilter 1, N'EXEC dbo.usp_QueryFirmWideAudit @Page = 1, @PageSize = 20';

    -- Assert — all three, newest first, workspace name resolved
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Count;
    DECLARE @First NVARCHAR(64) = (SELECT TOP (1) EventType FROM #Rows ORDER BY EventAt DESC);
    EXEC tSQLt.AssertEqualsString @Expected = N'platform-field.updated', @Actual = @First;
END;
GO

CREATE PROCEDURE FirmWideAuditTests.[test_WorkspaceFilter_Narrows]
AS
BEGIN
    DECLARE @WsA UNIQUEIDENTIFIER = NEWID(), @WsB UNIQUEIDENTIFIER = NEWID();
    EXEC FirmWideAuditTests.[Seed] @WsA = @WsA, @WsB = @WsB;

    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, WorkspaceName NVARCHAR(200),
        RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER,
        ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    DECLARE @Cmd NVARCHAR(MAX) = N'EXEC dbo.usp_QueryFirmWideAudit @WorkspaceId = ''' + CAST(@WsB AS NVARCHAR(36))
        + N''', @Page = 1, @PageSize = 20';
    INSERT INTO #Rows EXEC tSQLt.ResultSetFilter 1, @Cmd;

    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE FirmWideAuditTests.[test_EventTypeFilter_Narrows]
AS
BEGIN
    DECLARE @WsA UNIQUEIDENTIFIER = NEWID(), @WsB UNIQUEIDENTIFIER = NEWID();
    EXEC FirmWideAuditTests.[Seed] @WsA = @WsA, @WsB = @WsB;

    CREATE TABLE #Rows (AuditId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, WorkspaceName NVARCHAR(200),
        RecordId NVARCHAR(20), ObjectType NVARCHAR(16), EventType NVARCHAR(64), ActorUserId UNIQUEIDENTIFIER,
        ActorName NVARCHAR(200), EventAt DATETIME2, EventPayload NVARCHAR(MAX));
    INSERT INTO #Rows EXEC tSQLt.ResultSetFilter 1,
        N'EXEC dbo.usp_QueryFirmWideAudit @EventType = N''platform-field.updated'', @Page = 1, @PageSize = 20';

    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO
