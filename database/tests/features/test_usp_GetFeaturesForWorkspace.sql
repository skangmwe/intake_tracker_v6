-- =============================================
-- tSQLt tests for dbo.usp_GetFeaturesForWorkspace (Feature export read).
-- Covers: returns a workspace's features with the raw FieldValues JSON map, excludes soft-deleted
-- features, excludes other workspaces' features, and paginates via OFFSET/FETCH.
-- database-testing.md (AAA, FakeTable, AssertEquals — assign to a local, never inline @Actual=(SELECT)).
-- =============================================

EXEC tSQLt.NewTestClass 'GetFeaturesForWorkspaceTests';
GO

CREATE PROCEDURE GetFeaturesForWorkspaceTests.[test_ReturnsWorkspaceFeaturesWithFieldValues_ExcludesForeignAndDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';

    DECLARE @Ws      UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted)
    VALUES
        (N'AIS-9001', @Ws,      N'Alpha',   N'Published', N'{"name":"Alpha","featureType":"Functional"}', 0), -- included
        (N'AIS-9002', @Ws,      N'Beta',    N'Draft',     N'{"name":"Beta"}',                              0), -- included
        (N'AIS-9003', @Ws,      N'Deleted', N'Draft',     N'{}',                                           1), -- soft-deleted — excluded
        (N'FIN-0001', @OtherWs, N'Foreign', N'Draft',     N'{}',                                           0); -- other workspace — excluded

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20), FieldValues NVARCHAR(MAX));
    INSERT INTO #Actual EXEC dbo.usp_GetFeaturesForWorkspace @WorkspaceId = @Ws, @Page = 1, @PageSize = 100;

    -- Assert — only the two live features in this workspace are returned.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;

    -- The raw FieldValues map is carried through verbatim for the API to project.
    DECLARE @Fv NVARCHAR(MAX) = (SELECT FieldValues FROM #Actual WHERE RecordId = N'AIS-9001');
    EXEC tSQLt.AssertEqualsString @Expected = N'{"name":"Alpha","featureType":"Functional"}', @Actual = @Fv;

    -- The foreign-workspace feature did not leak in.
    DECLARE @Foreign INT = (SELECT COUNT(*) FROM #Actual WHERE RecordId = N'FIN-0001');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Foreign;

    -- The soft-deleted feature is excluded.
    DECLARE @Deleted INT = (SELECT COUNT(*) FROM #Actual WHERE RecordId = N'AIS-9003');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Deleted;
END;
GO

CREATE PROCEDURE GetFeaturesForWorkspaceTests.[test_Paginates_SecondPageReturnsNextFeature]
AS
BEGIN
    -- Arrange — three features; page size 2 → page 2 holds exactly the third by RecordId order.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';

    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted)
    VALUES
        (N'AIS-9001', @Ws, N'First',  N'Draft', N'{}', 0),
        (N'AIS-9002', @Ws, N'Second', N'Draft', N'{}', 0),
        (N'AIS-9003', @Ws, N'Third',  N'Draft', N'{}', 0);

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20), FieldValues NVARCHAR(MAX));
    INSERT INTO #Actual EXEC dbo.usp_GetFeaturesForWorkspace @WorkspaceId = @Ws, @Page = 2, @PageSize = 2;

    -- Assert — page 2 holds exactly the third feature.
    DECLARE @Total INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Total;

    DECLARE @Rec NVARCHAR(20) = (SELECT RecordId FROM #Actual);
    EXEC tSQLt.AssertEqualsString @Expected = N'AIS-9003', @Actual = @Rec;
END;
GO
