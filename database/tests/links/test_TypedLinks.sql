-- =============================================
-- tSQLt tests for the typed-link procs (Slice 10).
-- Covers: usp_CreateTypedLink (related insert + projection, self-link / target-missing /
--         duplicate-family guards), usp_GetTypedLinksForRecord (far name resolved for a member,
--         null when the caller can't see the far side), usp_DeleteTypedLink (soft-delete for a
--         member, no-op for a non-member). database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'TypedLinkTests';
GO

-- Shared arrange: WS-A (caller is a member, prefix AIS) + WS-B (caller is NOT a member, prefix BIZ);
-- two AIS records in WS-A and one BIZ record in WS-B; the caller (aa) is a member of WS-A only.
CREATE PROCEDURE TypedLinkTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.TypedLinks';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Stage, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', 'A1150000-0000-4000-8000-000000000001', N'Extractor',   N'build', 0, N'seed', N'seed'),
           (N'AIS-00000002', 'A1150000-0000-4000-8000-000000000001', N'Summariser',  N'qa',    0, N'seed', N'seed'),
           (N'BIZ-00000001', 'B0000000-0000-4000-8000-000000000002', N'Ops tracker', N'build', 0, N'seed', N'seed');

    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('A1150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
END;
GO

CREATE PROCEDURE TypedLinkTests.[test_CreateRelatedLinkInsertsAndResolvesFarName]
AS
BEGIN
    -- Act
    CREATE TABLE #Link (LinkId UNIQUEIDENTIFIER, FromRecordId NVARCHAR(20), ToRecordId NVARCHAR(20),
        LinkKind NVARCHAR(32), Rationale NVARCHAR(MAX), ToName NVARCHAR(400), ToStage NVARCHAR(64), CreatedAt DATETIME2);
    INSERT INTO #Link
    EXEC dbo.usp_CreateTypedLink
        @FromRecordId = N'AIS-00000001', @ToRecordId = N'AIS-00000002', @LinkKind = N'related',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @ActorUserId = N'aa';

    -- Assert — one link stored; the projection resolves the far record's name for the member.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM dbo.TypedLinks WHERE FromRecordId = N'AIS-00000001' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = N'Summariser', @Actual = (SELECT ToName FROM #Link);
END;
GO

CREATE PROCEDURE TypedLinkTests.[test_CreateSelfLinkThrows]
AS
BEGIN
    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%cannot link to itself%';
    -- Act
    EXEC dbo.usp_CreateTypedLink
        @FromRecordId = N'AIS-00000001', @ToRecordId = N'AIS-00000001', @LinkKind = N'related',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @ActorUserId = N'aa';
END;
GO

CREATE PROCEDURE TypedLinkTests.[test_CreateLinkToMissingTargetThrows]
AS
BEGIN
    -- Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%target record does not exist%';
    -- Act
    EXEC dbo.usp_CreateTypedLink
        @FromRecordId = N'AIS-00000001', @ToRecordId = N'AIS-99999999', @LinkKind = N'related',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @ActorUserId = N'aa';
END;
GO

CREATE PROCEDURE TypedLinkTests.[test_DuplicateOfDifferentFamilyThrows]
AS
BEGIN
    -- Assert — duplicate-of must stay within the same id-prefix family (AIS vs BIZ).
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%same workspace family%';
    -- Act
    EXEC dbo.usp_CreateTypedLink
        @FromRecordId = N'AIS-00000001', @ToRecordId = N'BIZ-00000001', @LinkKind = N'duplicate-of',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @ActorUserId = N'aa';
END;
GO

CREATE PROCEDURE TypedLinkTests.[test_GetLinksHidesFarNameWhenCallerCannotSeeFar]
AS
BEGIN
    -- Arrange — a related link to a record in WS-B, where the caller has no membership.
    EXEC dbo.usp_CreateTypedLink
        @FromRecordId = N'AIS-00000001', @ToRecordId = N'BIZ-00000001', @LinkKind = N'related',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @ActorUserId = N'aa';

    -- Act
    CREATE TABLE #Link (LinkId UNIQUEIDENTIFIER, FromRecordId NVARCHAR(20), ToRecordId NVARCHAR(20),
        LinkKind NVARCHAR(32), Rationale NVARCHAR(MAX), ToName NVARCHAR(400), ToStage NVARCHAR(64), CreatedAt DATETIME2);
    INSERT INTO #Link
    EXEC dbo.usp_GetTypedLinksForRecord @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — the link shows, but the far name/stage are null (id-only disclosure, BS §22.6).
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Link);
    EXEC tSQLt.AssertEquals @Expected = NULL, @Actual = (SELECT ToName FROM #Link);
END;
GO

CREATE PROCEDURE TypedLinkTests.[test_DeleteLinkSoftDeletesForMember]
AS
BEGIN
    -- Arrange
    DECLARE @LinkId UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.TypedLinks (LinkId, FromRecordId, ToRecordId, LinkKind, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@LinkId, N'AIS-00000001', N'AIS-00000002', N'related', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Result (Deleted INT, FromRecordId NVARCHAR(20));
    INSERT INTO #Result
    EXEC dbo.usp_DeleteTypedLink @LinkId = @LinkId, @UserId = '00000000-0000-4000-8000-0000000000aa', @ActorUserId = N'aa';

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT Deleted FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT IsDeleted FROM dbo.TypedLinks WHERE LinkId = @LinkId);
END;
GO

CREATE PROCEDURE TypedLinkTests.[test_DeleteLinkNoOpForNonMember]
AS
BEGIN
    -- Arrange — the caller (cc) is not a member of the FROM record's workspace.
    DECLARE @LinkId UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.TypedLinks (LinkId, FromRecordId, ToRecordId, LinkKind, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@LinkId, N'AIS-00000001', N'AIS-00000002', N'related', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Result (Deleted INT, FromRecordId NVARCHAR(20));
    INSERT INTO #Result
    EXEC dbo.usp_DeleteTypedLink @LinkId = @LinkId, @UserId = '00000000-0000-4000-8000-0000000000cc', @ActorUserId = N'cc';

    -- Assert — nothing deleted; the link stays live.
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT Deleted FROM #Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT IsDeleted FROM dbo.TypedLinks WHERE LinkId = @LinkId);
END;
GO
