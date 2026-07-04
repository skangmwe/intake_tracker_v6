-- =============================================
-- tSQLt tests for usp_FindSimilarRequests (Slice 6 - intake similar-requests nudge).
-- Covers: token-overlap match + score ordering, top-N cap, workspace scoping (no cross-
--         workspace leak), access gate (non-member gets nothing), empty query short-circuit.
-- database-testing.md (AAA, FakeTable). Counts are read into a local variable before AssertEquals
-- (a subquery cannot be passed directly as an EXEC parameter inside a procedure body).
-- =============================================

EXEC tSQLt.NewTestClass 'SimilarRequestsTests';
GO

CREATE PROCEDURE SimilarRequestsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
END;
GO

CREATE PROCEDURE SimilarRequestsTests.[test_MatchesOnNameAndDescriptionOrderedByScore]
AS
BEGIN
    -- Arrange - two records; the second matches two tokens, the first only one.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Description, Stage, FieldValues, UpdatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Contract review helper', N'Summarise vendor contracts', N'intake', N'{}', '2026-07-01', 0, N'seed', N'seed'),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Contract clause extraction', N'Extract clauses from contract sets', N'intake', N'{}', '2026-07-02', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_FindSimilarRequests
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @Query = N'contract clause', @Top = 3;

    -- Assert - both match; the two-token record ranks first.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
    DECLARE @First NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000002', @Actual = @First;
END;
GO

CREATE PROCEDURE SimilarRequestsTests.[test_TopCapsResults]
AS
BEGIN
    -- Arrange - three matching records, ask for the top 2.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Description, Stage, FieldValues, UpdatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Billing report one', N'', N'intake', N'{}', '2026-07-01', 0, N'seed', N'seed'),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Billing report two', N'', N'intake', N'{}', '2026-07-02', 0, N'seed', N'seed'),
           (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Billing report three', N'', N'intake', N'{}', '2026-07-03', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_FindSimilarRequests
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @Query = N'billing report', @Top = 2;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

CREATE PROCEDURE SimilarRequestsTests.[test_DoesNotLeakAcrossWorkspaces]
AS
BEGIN
    -- Arrange - a matching record in another workspace the caller cannot see.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Description, Stage, FieldValues, UpdatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Contract helper', N'', N'intake', N'{}', '2026-07-01', 0, N'seed', N'seed'),
           (N'OTH-00000001', '2B260000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', N'Contract helper elsewhere', N'', N'intake', N'{}', '2026-07-02', 0, N'seed', N'seed');

    -- Act - search scoped to the caller's workspace only.
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_FindSimilarRequests
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa',
        @Query = N'contract', @Top = 5;

    -- Assert - only the in-workspace record; the other workspace never leaks (BS 9.5).
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Only NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @Only;
END;
GO

CREATE PROCEDURE SimilarRequestsTests.[test_NonMemberGetsNothing]
AS
BEGIN
    -- Arrange - matching record, but the caller is not a member.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Description, Stage, FieldValues, UpdatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Contract helper', N'', N'intake', N'{}', '2026-07-01', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_FindSimilarRequests
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000bb', @Query = N'contract', @Top = 5;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE SimilarRequestsTests.[test_EmptyQueryReturnsNothing]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Description, Stage, FieldValues, UpdatedAt, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', N'Contract helper', N'', N'intake', N'{}', '2026-07-01', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_FindSimilarRequests
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'   ', @Top = 5;

    -- Assert - a blank query short-circuits before any match.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO
