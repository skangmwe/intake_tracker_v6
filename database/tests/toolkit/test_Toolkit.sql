-- =============================================
-- tSQLt tests for the Toolkit procs (Slice 29).
-- Covers: usp_CreateToolkitItem (mint + row + Origin + Status-default + Kind),
--         usp_GetToolkitItemForUser (access-baked read: row for a member, nothing for a non-member),
--         usp_QueryToolkit (kind filter + search + total count), usp_PatchToolkitItem (happy-path
--         field update with matching ETag), usp_RetireToolkitItem / usp_RestoreToolkitItem
--         (member self-gate flips IsDeleted; non-member is a no-op). database-testing.md (AAA, FakeTable).
--
-- Note: scalar assertions read the value into a SQL_VARIANT local before passing it to
-- tSQLt.AssertEquals (a parenthesised subquery is not a valid EXEC argument in T-SQL). The stale-ETag
-- and not-found THROW paths are covered by the API controller tests — usp_PatchToolkitItem follows the
-- repo-mandated BEGIN TRAN … CATCH: IF @@TRANCOUNT>0 ROLLBACK pattern, whose ROLLBACK collapses tSQLt's
-- own per-test transaction on THROW (a systemic tSQLt/proc-transaction incompatibility, repo-wide).
-- =============================================

EXEC tSQLt.NewTestClass 'ToolkitTests';
GO

CREATE PROCEDURE ToolkitTests.[test_CreateToolkitItemMintsRowAndDefaults]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    INSERT INTO dbo.Workspaces (WorkspaceId, Prefix, NextSequence, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'AIS', 0, 0);
    INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, IsDeleted)
    VALUES (N'AIS', '1A150000-0000-4000-8000-000000000001', N'AI Solutions', 0);

    DECLARE @RecordId NVARCHAR(20);
    DECLARE @Actual SQL_VARIANT;

    -- Act — Status omitted, so the proc must default it to Draft.
    EXEC dbo.usp_CreateToolkitItem
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Kind        = N'Prompt',
        @Status      = NULL,
        @Name        = N'Clause extraction prompt',
        @OneLiner    = N'Pulls structured clauses out of contracts',
        @Maintainer  = N'Mia Chen',
        @BodyMarkdown = N'You are a contracts analyst...',
        @ActorUserId = N'00000000-0000-4000-8000-0000000000aa',
        @RecordId    = @RecordId OUTPUT;

    -- Assert — id minted from the AI prefix, Origin resolved, Status defaults Draft, Kind persisted.
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @RecordId;
    SET @Actual = (SELECT Status FROM dbo.ToolkitItem WHERE RecordId = @RecordId);
    EXEC tSQLt.AssertEquals @Expected = N'Draft', @Actual = @Actual;
    SET @Actual = (SELECT Kind FROM dbo.ToolkitItem WHERE RecordId = @RecordId);
    EXEC tSQLt.AssertEquals @Expected = N'Prompt', @Actual = @Actual;
    SET @Actual = (SELECT Origin FROM dbo.ToolkitItem WHERE RecordId = @RecordId);
    EXEC tSQLt.AssertEquals @Expected = N'AI Solutions', @Actual = @Actual;
END;
GO

CREATE PROCEDURE ToolkitTests.[test_GetByIdReturnsRowForMember]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Playbook', N'Active', N'Intake playbook', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Viewer', 0);

    -- Act — #Actual mirrors the proc's column set (INSERT ... EXEC matches by position + count).
    CREATE TABLE #Actual (RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER, Kind NVARCHAR(20), Status NVARCHAR(20),
        Name NVARCHAR(200), OneLiner NVARCHAR(300), Description NVARCHAR(2000), Maintainer NVARCHAR(200),
        HowTo NVARCHAR(2000), BodyMarkdown NVARCHAR(MAX), AttachmentBlobPath NVARCHAR(400), AttachmentFileName NVARCHAR(400),
        AttachmentContentType NVARCHAR(200), AttachmentSizeBytes BIGINT, CreatedAt DATETIME2, UpdatedAt DATETIME2,
        CreatedBy NVARCHAR(256), UpdatedBy NVARCHAR(256), IsDeleted BIT, RowVer VARBINARY(8));
    INSERT INTO #Actual
    EXEC dbo.usp_GetToolkitItemForUser @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert
    DECLARE @Count SQL_VARIANT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE ToolkitTests.[test_GetByIdReturnsNothingForNonMember]
AS
BEGIN
    -- Arrange — the item exists but the caller has no workspace membership.
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Playbook', N'Active', N'Intake playbook', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Actual (RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER, Kind NVARCHAR(20), Status NVARCHAR(20),
        Name NVARCHAR(200), OneLiner NVARCHAR(300), Description NVARCHAR(2000), Maintainer NVARCHAR(200),
        HowTo NVARCHAR(2000), BodyMarkdown NVARCHAR(MAX), AttachmentBlobPath NVARCHAR(400), AttachmentFileName NVARCHAR(400),
        AttachmentContentType NVARCHAR(200), AttachmentSizeBytes BIGINT, CreatedAt DATETIME2, UpdatedAt DATETIME2,
        CreatedBy NVARCHAR(256), UpdatedBy NVARCHAR(256), IsDeleted BIT, RowVer VARBINARY(8));
    INSERT INTO #Actual
    EXEC dbo.usp_GetToolkitItemForUser @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert — zero rows: the API turns this into a 403, never disclosing existence.
    DECLARE @Count SQL_VARIANT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE ToolkitTests.[test_QueryToolkitFiltersByKind]
AS
BEGIN
    -- Arrange — two Prompt + one Playbook; the kind filter should return only the Prompt pair.
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Prompt', N'Active', N'Prompt one', 0, N'seed', N'seed'),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', N'Prompt', N'Draft', N'Prompt two', 0, N'seed', N'seed'),
           (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', N'Playbook', N'Active', N'Playbook one', 0, N'seed', N'seed');

    -- Act — capture the first (page rows) result set.
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Kind NVARCHAR(20), Status NVARCHAR(20), Name NVARCHAR(200),
        OneLiner NVARCHAR(300), Maintainer NVARCHAR(200), HasAttachment BIT, UpdatedBy NVARCHAR(256),
        UpdatedAt DATETIME2, RowVer VARBINARY(8));
    INSERT INTO #Rows
    EXEC tSQLt.ResultSetFilter 1, N'EXEC dbo.usp_QueryToolkit
        @WorkspaceId = N''1A150000-0000-4000-8000-000000000001'', @Page = 1, @PageSize = 20,
        @FiltersJson = N''{"kind":["Prompt"]}'', @SortColumn = N''name'', @SortDir = N''asc''';

    -- Assert — only the two Prompt rows land in the page result.
    DECLARE @Total SQL_VARIANT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
    DECLARE @NonPrompt SQL_VARIANT = (SELECT COUNT(*) FROM #Rows WHERE Kind <> N'Prompt');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @NonPrompt;
END;
GO

CREATE PROCEDURE ToolkitTests.[test_QueryToolkitSearchMatchesAcrossFields]
AS
BEGIN
    -- Arrange — the search term appears in one item's Description only; it must still match.
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, Description, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Prompt', N'Active', N'Alpha', N'Handles deposition transcripts', 0, N'seed', N'seed'),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', N'Prompt', N'Active', N'Beta', N'Handles contracts', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Kind NVARCHAR(20), Status NVARCHAR(20), Name NVARCHAR(200),
        OneLiner NVARCHAR(300), Maintainer NVARCHAR(200), HasAttachment BIT, UpdatedBy NVARCHAR(256),
        UpdatedAt DATETIME2, RowVer VARBINARY(8));
    INSERT INTO #Rows
    EXEC tSQLt.ResultSetFilter 1, N'EXEC dbo.usp_QueryToolkit
        @WorkspaceId = N''1A150000-0000-4000-8000-000000000001'', @Page = 1, @PageSize = 20,
        @FiltersJson = N''{"search":"deposition"}''';

    -- Assert — only the item whose Description contains the term.
    DECLARE @Total SQL_VARIANT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Total;
    DECLARE @Match SQL_VARIANT = (SELECT Name FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = N'Alpha', @Actual = @Match;
END;
GO

CREATE PROCEDURE ToolkitTests.[test_PatchToolkitItemUpdatesFields]
AS
BEGIN
    -- Arrange — FakeTable keeps RowVer as a real ROWVERSION; read it back as the matching ETag.
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Prompt', N'Draft', N'Original', 0, N'seed', N'seed');
    DECLARE @IfMatch VARBINARY(8) = (SELECT RowVer FROM dbo.ToolkitItem WHERE RecordId = N'AIS-00000001');

    -- Act — publish + rename with the matching ETag.
    EXEC dbo.usp_PatchToolkitItem
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Kind = N'Prompt', @Status = N'Active', @Name = N'Renamed item', @OneLiner = N'new summary',
        @IfMatchRowVer = @IfMatch, @ActorUserId = N'aa';

    -- Assert — name + status advanced.
    DECLARE @Actual SQL_VARIANT;
    SET @Actual = (SELECT Name FROM dbo.ToolkitItem WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Renamed item', @Actual = @Actual;
    SET @Actual = (SELECT Status FROM dbo.ToolkitItem WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Active', @Actual = @Actual;
END;
GO

CREATE PROCEDURE ToolkitTests.[test_RetireMemberSoftDeletesNonMemberNoOp]
AS
BEGIN
    -- Arrange — a live item; one Member caller and one non-member caller.
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Prompt', N'Active', N'Item', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    DECLARE @Retired BIT;
    DECLARE @Actual SQL_VARIANT;

    -- Act 1 — a non-member cannot retire (no-op).
    EXEC dbo.usp_RetireToolkitItem @RecordId = N'AIS-00000001',
        @UserId = '00000000-0000-4000-8000-0000000000bb', @ActorUserId = N'bb', @Retired = @Retired OUTPUT;
    SET @Actual = @Retired;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Actual;
    SET @Actual = (SELECT IsDeleted FROM dbo.ToolkitItem WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Actual;

    -- Act 2 — a Member retires the item.
    EXEC dbo.usp_RetireToolkitItem @RecordId = N'AIS-00000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @ActorUserId = N'aa', @Retired = @Retired OUTPUT;
    SET @Actual = @Retired;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Actual;
    SET @Actual = (SELECT IsDeleted FROM dbo.ToolkitItem WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Actual;
END;
GO

CREATE PROCEDURE ToolkitTests.[test_RestoreMemberUnDeletesRetiredItem]
AS
BEGIN
    -- Arrange — a retired item + a Member caller.
    EXEC tSQLt.FakeTable @TableName = 'dbo.ToolkitItem';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.ToolkitItem (RecordId, WorkspaceId, Kind, Status, Name, IsDeleted, DeletedAt, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Prompt', N'Active', N'Item', 1, SYSUTCDATETIME(), N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    DECLARE @Restored BIT;
    DECLARE @Actual SQL_VARIANT;

    -- Act
    EXEC dbo.usp_RestoreToolkitItem @RecordId = N'AIS-00000001',
        @UserId = '00000000-0000-4000-8000-0000000000aa', @ActorUserId = N'aa', @Restored = @Restored OUTPUT;

    -- Assert — the item is live again.
    SET @Actual = @Restored;
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Actual;
    SET @Actual = (SELECT IsDeleted FROM dbo.ToolkitItem WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Actual;
END;
GO
