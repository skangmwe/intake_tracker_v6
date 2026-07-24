-- =============================================
-- tSQLt tests for dbo.usp_GetRequestsForWorkspace (Request export read).
-- Covers: returns a workspace's requests with the raw FieldValues JSON map, excludes soft-deleted
-- requests, excludes other workspaces' requests, and paginates via OFFSET/FETCH.
-- database-testing.md (AAA, FakeTable, AssertEquals — assign to a local, never inline @Actual=(SELECT)).
-- =============================================

EXEC tSQLt.NewTestClass 'GetRequestsForWorkspaceTests';
GO

CREATE PROCEDURE GetRequestsForWorkspaceTests.[test_ReturnsWorkspaceRequestsWithFieldValues_ExcludesForeignAndDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';

    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Stage, FieldValues, IsDeleted)
    VALUES
        (N'AIS-00000001', @Ws,      N'Alpha',   N'intake',   N'{"name":"Alpha","businessValue":5}', 0), -- included
        (N'AIS-00000002', @Ws,      N'Beta',    N'delivery', N'{"name":"Beta"}',                     0), -- included
        (N'AIS-00000003', @Ws,      N'Deleted', N'intake',   N'{}',                                  1), -- soft-deleted — excluded
        (N'FIN-00000001', @OtherWs, N'Foreign', N'intake',   N'{}',                                  0); -- other workspace — excluded

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20), FieldValues NVARCHAR(MAX));
    INSERT INTO #Actual EXEC dbo.usp_GetRequestsForWorkspace @WorkspaceId = @Ws, @Page = 1, @PageSize = 100;

    -- Assert — only the two live requests in this workspace are returned.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    -- The raw FieldValues map is carried through verbatim for the API to project.
    DECLARE @Fv NVARCHAR(MAX) = (SELECT FieldValues FROM #Actual WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEqualsString @Expected = N'{"name":"Alpha","businessValue":5}', @Actual = @Fv;

    -- The foreign-workspace request did not leak in.
    DECLARE @Foreign INT = (SELECT COUNT(*) FROM #Actual WHERE RecordId = N'FIN-00000001');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Foreign;

    -- The soft-deleted request is excluded.
    DECLARE @Deleted INT = (SELECT COUNT(*) FROM #Actual WHERE RecordId = N'AIS-00000003');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Deleted;
END;
GO

CREATE PROCEDURE GetRequestsForWorkspaceTests.[test_Paginates_SecondPageReturnsNextRequest]
AS
BEGIN
    -- Arrange — three requests; page size 2 → page 2 holds exactly the third by RecordId order.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';

    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Stage, FieldValues, IsDeleted)
    VALUES
        (N'AIS-00000001', @Ws, N'First',  N'intake', N'{}', 0),
        (N'AIS-00000002', @Ws, N'Second', N'intake', N'{}', 0),
        (N'AIS-00000003', @Ws, N'Third',  N'intake', N'{}', 0);

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20), FieldValues NVARCHAR(MAX));
    INSERT INTO #Actual EXEC dbo.usp_GetRequestsForWorkspace @WorkspaceId = @Ws, @Page = 2, @PageSize = 2;

    -- Assert — page 2 holds exactly the third request.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Total;

    DECLARE @Rec NVARCHAR(20) = (SELECT RecordId FROM #Actual);
    EXEC tSQLt.AssertEqualsString @Expected = N'AIS-00000003', @Actual = @Rec;
END;
GO
