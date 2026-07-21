-- =============================================
-- tSQLt tests for the Search procs (Slice 15).
--   usp_SearchRecords — top-bar records-only quick search (single result set).
--   usp_SearchFull    — S27 full search across records + comments + attachment filenames
--                       (two result sets: page rows, then TotalCount; the page rows are captured
--                        into a shaped temp table, mirroring QueryRequestsTests).
-- Covers: token-overlap match + ordering, RecordId + Legacy ID match, top-N / page cap, workspace
--         scoping (no cross-workspace leak), access gate (non-member gets nothing / empty page),
--         empty-query short-circuit, soft-delete exclusion, and the three match kinds.
-- database-testing.md (AAA, FakeTable). Counts are read into a local before AssertEquals (a
-- subquery cannot be passed directly as an EXEC parameter).
-- =============================================

EXEC tSQLt.NewTestClass 'SearchTests';
GO

-- Common ids: workspace A the caller can see; workspace B they cannot. Member @aa; non-member @bb.
CREATE PROCEDURE SearchTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Comments';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Attachments';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';

    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
END;
GO

-- ─── usp_SearchRecords ──────────────────────────────────────────────────────

CREATE PROCEDURE SearchTests.[test_Records_MatchesByNameOrderedByScore]
AS
BEGIN
    -- Arrange — the two-token record ranks above the one-token record.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Contract review helper', N'Summarise vendor contracts', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', N'Contract clause extraction', N'Extract clauses', N'execution', N'AI Solutions', N'{}', '2026-07-02', 0);

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_SearchRecords @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'contract clause', @Top = 6;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
    DECLARE @First NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000002', @Actual = @First;
END;
GO

CREATE PROCEDURE SearchTests.[test_Records_MatchesByRecordId]
AS
BEGIN
    -- Arrange — a query that only appears in the record's minted id.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00004471', '1A150000-0000-4000-8000-000000000001', N'Unrelated name', N'Unrelated body', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0);

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_SearchRecords @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'00004471', @Top = 6;

    -- Assert
    DECLARE @Only NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00004471', @Actual = @Only;
END;
GO

CREATE PROCEDURE SearchTests.[test_Records_MatchesByLegacyId]
AS
BEGIN
    -- Arrange — Legacy ID lives in the FieldValues JSON map (populated by CSV import, slice 16).
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Migrated record', N'body', N'intake', N'AI Solutions', N'{"legacyId":"OLDSYS-8842"}', '2026-07-01', 0);

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_SearchRecords @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'OLDSYS-8842', @Top = 6;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE SearchTests.[test_Records_CapsAtTop]
AS
BEGIN
    -- Arrange — three matches, ask for the top 2.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Billing report one', N'', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', N'Billing report two', N'', N'intake', N'AI Solutions', N'{}', '2026-07-02', 0),
           (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', N'Billing report three', N'', N'intake', N'AI Solutions', N'{}', '2026-07-03', 0);

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_SearchRecords @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'billing report', @Top = 2;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

CREATE PROCEDURE SearchTests.[test_Records_NonMemberGetsNothing]
AS
BEGIN
    -- Arrange — a matching record, but the caller is not a member.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Contract helper', N'', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0);

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_SearchRecords @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000bb', @Query = N'contract', @Top = 6;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE SearchTests.[test_Records_DoesNotLeakAcrossWorkspaces]
AS
BEGIN
    -- Arrange — a matching record in workspace B the caller cannot see.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Contract helper', N'', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0),
           (N'OTH-00000001', '2B260000-0000-4000-8000-000000000002', N'Contract helper elsewhere', N'', N'intake', N'Other', N'{}', '2026-07-02', 0);

    -- Act — scoped to workspace A.
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_SearchRecords @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'contract', @Top = 6;

    -- Assert — only the in-workspace record.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Only NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @Only;
END;
GO

CREATE PROCEDURE SearchTests.[test_Records_EmptyQueryReturnsNothing]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Contract helper', N'', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0);

    -- Act
    CREATE TABLE #Hits (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64), Origin NVARCHAR(200));
    INSERT INTO #Hits
    EXEC dbo.usp_SearchRecords @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'   ', @Top = 6;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Hits);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

-- ─── usp_SearchFull ─────────────────────────────────────────────────────────

-- One record + one comment + one attachment, all containing the token 'omega', so all three
-- match kinds surface for the same parent record.
CREATE PROCEDURE SearchTests.SeedOmega
AS
BEGIN
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Omega intake helper', N'body', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0);

    INSERT INTO dbo.Comments (RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request', '00000000-0000-4000-8000-0000000000aa', N'discussing the omega threshold', '2026-07-02', 0);

    INSERT INTO dbo.Attachments (RecordId, WorkspaceId, ObjectType, FileName, CreatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request', N'omega-spec.pdf', '2026-07-03', 0);
END;
GO

CREATE PROCEDURE SearchTests.[test_Full_ReturnsRecordCommentAndAttachmentKinds]
AS
BEGIN
    -- Arrange
    EXEC SearchTests.SeedOmega;

    -- Act — capture the page-row result set (mirrors QueryRequestsTests).
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), MatchKind NVARCHAR(16), Snippet NVARCHAR(400));
    INSERT INTO #Rows
    EXEC dbo.usp_SearchFull @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'omega', @Page = 1, @PageSize = 20;

    -- Assert — one hit per source, all carrying the parent record's name.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Count;
    DECLARE @Kinds INT = (SELECT COUNT(DISTINCT MatchKind) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Kinds;
    DECLARE @Names INT = (SELECT COUNT(*) FROM #Rows WHERE Name = N'Omega intake helper');
    EXEC tSQLt.AssertEquals @Expected = 3, @Actual = @Names;
END;
GO

CREATE PROCEDURE SearchTests.[test_Full_CommentBodyHitCarriesParentRecord]
AS
BEGIN
    -- Arrange — the token appears only in a comment body.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000009', '1A150000-0000-4000-8000-000000000001', N'Parent record', N'nothing here', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0);
    INSERT INTO dbo.Comments (RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, IsDeleted)
    VALUES (N'AIS-00000009', '1A150000-0000-4000-8000-000000000001', N'Request', '00000000-0000-4000-8000-0000000000aa', N'contains the zephyr keyword', '2026-07-02', 0);

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), MatchKind NVARCHAR(16), Snippet NVARCHAR(400));
    INSERT INTO #Rows
    EXEC dbo.usp_SearchFull @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'zephyr', @Page = 1, @PageSize = 20;

    -- Assert
    DECLARE @Kind NVARCHAR(16) = (SELECT TOP 1 MatchKind FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'comment', @Actual = @Kind;
    DECLARE @Name NVARCHAR(400) = (SELECT TOP 1 Name FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'Parent record', @Actual = @Name;
END;
GO

CREATE PROCEDURE SearchTests.[test_Full_AttachmentFilenameHit]
AS
BEGIN
    -- Arrange — the token appears only in an attachment filename.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000010', '1A150000-0000-4000-8000-000000000001', N'Parent record', N'body', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0);
    INSERT INTO dbo.Attachments (RecordId, WorkspaceId, ObjectType, FileName, CreatedAt, IsDeleted)
    VALUES (N'AIS-00000010', '1A150000-0000-4000-8000-000000000001', N'Request', N'quarterly-forecast.xlsx', '2026-07-03', 0);

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), MatchKind NVARCHAR(16), Snippet NVARCHAR(400));
    INSERT INTO #Rows
    EXEC dbo.usp_SearchFull @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'forecast', @Page = 1, @PageSize = 20;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Kind NVARCHAR(16) = (SELECT TOP 1 MatchKind FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'attachment', @Actual = @Kind;
END;
GO

CREATE PROCEDURE SearchTests.[test_Full_ExcludesSoftDeletedSources]
AS
BEGIN
    -- Arrange — a soft-deleted comment and a soft-deleted attachment must not surface; only the
    -- live record hit does.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Omega intake helper', N'body', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0);
    INSERT INTO dbo.Comments (RecordId, WorkspaceId, ObjectType, AuthorUserId, Body, CreatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request', '00000000-0000-4000-8000-0000000000aa', N'omega note', '2026-07-02', 1);
    INSERT INTO dbo.Attachments (RecordId, WorkspaceId, ObjectType, FileName, CreatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Request', N'omega.pdf', '2026-07-03', 1);

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), MatchKind NVARCHAR(16), Snippet NVARCHAR(400));
    INSERT INTO #Rows
    EXEC dbo.usp_SearchFull @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'omega', @Page = 1, @PageSize = 20;

    -- Assert — only the record hit survives.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Kind NVARCHAR(16) = (SELECT TOP 1 MatchKind FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'record', @Actual = @Kind;
END;
GO

CREATE PROCEDURE SearchTests.[test_Full_NonMemberGetsEmptyPage]
AS
BEGIN
    -- Arrange
    EXEC SearchTests.SeedOmega;

    -- Act — caller is not a member of the workspace.
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), MatchKind NVARCHAR(16), Snippet NVARCHAR(400));
    INSERT INTO #Rows
    EXEC dbo.usp_SearchFull @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000bb', @Query = N'omega', @Page = 1, @PageSize = 20;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE SearchTests.[test_Full_EmptyQueryReturnsEmptyPage]
AS
BEGIN
    -- Arrange
    EXEC SearchTests.SeedOmega;

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), MatchKind NVARCHAR(16), Snippet NVARCHAR(400));
    INSERT INTO #Rows
    EXEC dbo.usp_SearchFull @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'  ', @Page = 1, @PageSize = 20;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE SearchTests.[test_Full_PaginationLimitsPageRows]
AS
BEGIN
    -- Arrange — three distinct matching records; a page size of 2 returns two rows.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Omega one', N'', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', N'Omega two', N'', N'intake', N'AI Solutions', N'{}', '2026-07-02', 0),
           (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', N'Omega three', N'', N'intake', N'AI Solutions', N'{}', '2026-07-03', 0);

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), MatchKind NVARCHAR(16), Snippet NVARCHAR(400));
    INSERT INTO #Rows
    EXEC dbo.usp_SearchFull @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'omega', @Page = 1, @PageSize = 2;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Count;
END;
GO

CREATE PROCEDURE SearchTests.[test_Full_DoesNotLeakAcrossWorkspaces]
AS
BEGIN
    -- Arrange — a matching record in workspace B the caller cannot see.
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Description, Stage, Origin, FieldValues, UpdatedAt, IsDeleted)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Omega here', N'', N'intake', N'AI Solutions', N'{}', '2026-07-01', 0),
           (N'OTH-00000001', '2B260000-0000-4000-8000-000000000002', N'Omega elsewhere', N'', N'intake', N'Other', N'{}', '2026-07-02', 0);

    -- Act — scoped to workspace A.
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Stage NVARCHAR(64),
                        Origin NVARCHAR(200), MatchKind NVARCHAR(16), Snippet NVARCHAR(400));
    INSERT INTO #Rows
    EXEC dbo.usp_SearchFull @WorkspaceId = N'1A150000-0000-4000-8000-000000000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @Query = N'omega', @Page = 1, @PageSize = 20;

    -- Assert — only workspace A's record.
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Only NVARCHAR(20) = (SELECT TOP 1 RecordId FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @Only;
END;
GO
