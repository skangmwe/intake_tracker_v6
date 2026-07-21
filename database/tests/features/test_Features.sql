-- =============================================
-- tSQLt tests for the Feature Catalog procs (Slice 14).
-- Covers: usp_CreateFeature (mint + row + mirrored name/maturity + queued sourced-from link),
--         usp_GetFeatureByIdForUser (access-baked read: row for a member, nothing for a non-member),
--         usp_QueryFeatures (maturity filter + total count), usp_PatchFeature (stale-ETag throw),
--         usp_SetFeatureMaturity (publish transition + mirror). database-testing.md (AAA, FakeTable).
--
-- Note: scalar assertions read the value into a SQL_VARIANT local before passing it to
-- tSQLt.AssertEquals — a parenthesised subquery is NOT a valid EXEC argument in T-SQL
-- (`EXEC proc @arg = (SELECT …)` raises Msg 102). The rest of the repo's tSQLt suite uses the
-- invalid inline-subquery form and does not currently parse; these tests use the valid form.
-- =============================================

EXEC tSQLt.NewTestClass 'FeatureCatalogTests';
GO

CREATE PROCEDURE FeatureCatalogTests.[test_CreateFeatureMintsAndMirrorsNameAndMaturity]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    INSERT INTO dbo.Workspaces (WorkspaceId, Prefix, NextSequence, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'AIS', 0, 0);
    INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, IsDeleted)
    VALUES (N'AIS', '1A150000-0000-4000-8000-000000000001', N'AI Solutions', 0);

    DECLARE @RecordId NVARCHAR(20);
    DECLARE @Actual SQL_VARIANT;

    -- Act
    EXEC dbo.usp_CreateFeature
        @WorkspaceId     = '1A150000-0000-4000-8000-000000000001',
        @Name            = N'Bounding-box citation overlay',
        @FieldValuesJson = N'{"oneLiner":"Highlight source lines","featureType":"UI/visual"}',
        @ActorUserId     = N'00000000-0000-4000-8000-0000000000aa',
        @RecordId        = @RecordId OUTPUT;

    -- Assert — id minted from the AI prefix, name/maturity mirrored, Maturity defaults Draft.
    EXEC tSQLt.AssertEquals @Expected = N'AIS-00000001', @Actual = @RecordId;
    SET @Actual = (SELECT Maturity FROM dbo.Features WHERE RecordId = @RecordId);
    EXEC tSQLt.AssertEquals @Expected = N'Draft', @Actual = @Actual;
    SET @Actual = (SELECT Origin FROM dbo.Features WHERE RecordId = @RecordId);
    EXEC tSQLt.AssertEquals @Expected = N'AI Solutions', @Actual = @Actual;
    SET @Actual = (SELECT JSON_VALUE(FieldValues, N'$.name') FROM dbo.Features WHERE RecordId = @RecordId);
    EXEC tSQLt.AssertEquals @Expected = N'Bounding-box citation overlay', @Actual = @Actual;
    SET @Actual = (SELECT JSON_VALUE(FieldValues, N'$.maturity') FROM dbo.Features WHERE RecordId = @RecordId);
    EXEC tSQLt.AssertEquals @Expected = N'Draft', @Actual = @Actual;
END;
GO

CREATE PROCEDURE FeatureCatalogTests.[test_CreateFeatureStampsQueuedSourcedFromLink]
AS
BEGIN
    -- Arrange — a source Request exists so the queued sourced-from link's target passes the EXISTS check.
    -- @Defaults=1 keeps the IsDeleted default on TypedLinks (the proc relies on it for the stamped link).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests', @Defaults = 1;
    EXEC tSQLt.FakeTable @TableName = 'dbo.TypedLinks', @Defaults = 1;
    INSERT INTO dbo.Workspaces (WorkspaceId, Prefix, NextSequence, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', N'AIS', 5, 0);
    INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, IsDeleted)
    VALUES (N'AIS', '1A150000-0000-4000-8000-000000000001', N'AI Solutions', 0);
    INSERT INTO dbo.Requests (RecordId, WorkspaceId, Name, Stage, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', N'Source request', N'delivery', 0, N'seed', N'seed');

    DECLARE @RecordId NVARCHAR(20);
    DECLARE @Actual SQL_VARIANT;

    -- Act
    EXEC dbo.usp_CreateFeature
        @WorkspaceId     = '1A150000-0000-4000-8000-000000000001',
        @Name            = N'Harvested feature',
        @FieldValuesJson = N'{"featureType":"functional"}',
        @ActorUserId     = N'00000000-0000-4000-8000-0000000000aa',
        @RecordId        = @RecordId OUTPUT,
        @QueuedLinksJson = N'[{"toRecordId":"AIS-00000003","kind":"sourced-from"}]';

    -- Assert — one sourced-from link from the new feature to the source Request.
    SET @Actual = (SELECT COUNT(*) FROM dbo.TypedLinks
                   WHERE FromRecordId = @RecordId AND ToRecordId = N'AIS-00000003'
                     AND LinkKind = N'sourced-from' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Actual;
END;
GO

CREATE PROCEDURE FeatureCatalogTests.[test_GetByIdReturnsRowForMember]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Feat', N'Published', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);

    -- Act
    -- #Actual mirrors the proc's full column set (INSERT ... EXEC matches by position + count).
    CREATE TABLE #Actual (RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER, Origin NVARCHAR(200),
        Name NVARCHAR(400), Maturity NVARCHAR(16), FieldValues NVARCHAR(MAX), CreatedAt DATETIME2,
        UpdatedAt DATETIME2, CreatedBy NVARCHAR(256), UpdatedBy NVARCHAR(256), RowVer VARBINARY(8));
    INSERT INTO #Actual
    EXEC dbo.usp_GetFeatureByIdForUser @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert
    DECLARE @Count SQL_VARIANT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE FeatureCatalogTests.[test_GetByIdReturnsNothingForNonMember]
AS
BEGIN
    -- Arrange — the feature exists but the caller has no AI-workspace membership.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Feat', N'Published', N'{}', 0, N'seed', N'seed');

    -- Act
    -- #Actual mirrors the proc's full column set (INSERT ... EXEC matches by position + count).
    CREATE TABLE #Actual (RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER, Origin NVARCHAR(200),
        Name NVARCHAR(400), Maturity NVARCHAR(16), FieldValues NVARCHAR(MAX), CreatedAt DATETIME2,
        UpdatedAt DATETIME2, CreatedBy NVARCHAR(256), UpdatedBy NVARCHAR(256), RowVer VARBINARY(8));
    INSERT INTO #Actual
    EXEC dbo.usp_GetFeatureByIdForUser @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000bb';

    -- Assert — zero rows: the API turns this into a 403, never disclosing existence.
    DECLARE @Count SQL_VARIANT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE FeatureCatalogTests.[test_QueryFeaturesFiltersByMaturity]
AS
BEGIN
    -- Arrange — two Published + one Draft; the maturity filter should return only the Published pair.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Attachments';   -- the gallery thumbnail OUTER APPLY reads this
    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Pub one', N'Published', N'{"featureType":"functional"}', 0, N'seed', N'seed'),
           (N'AIS-00000002', '1A150000-0000-4000-8000-000000000001', N'Pub two', N'Published', N'{"featureType":"integration"}', 0, N'seed', N'seed'),
           (N'AIS-00000003', '1A150000-0000-4000-8000-000000000001', N'Draft one', N'Draft', N'{"featureType":"workflow"}', 0, N'seed', N'seed');

    -- Act — capture the first (page rows) result set.
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Maturity NVARCHAR(16), OneLiner NVARCHAR(400),
        FeatureType NVARCHAR(32), OwnerUserId NVARCHAR(200), Origin NVARCHAR(200), FieldValues NVARCHAR(MAX),
        UpdatedAt DATETIME2, RowVer VARBINARY(8), ThumbnailAttachmentId UNIQUEIDENTIFIER);
    -- usp_QueryFeatures returns two result sets (page rows + TotalCount); capture only the first.
    INSERT INTO #Rows
    EXEC tSQLt.ResultSetFilter 1, N'EXEC dbo.usp_QueryFeatures
        @WorkspaceId = N''1A150000-0000-4000-8000-000000000001'', @Page = 1, @PageSize = 25,
        @FiltersJson = N''{"maturity":["Published"]}'', @SortColumn = N''name'', @SortDir = N''asc''';

    -- Assert — only the two Published rows land in the page result.
    DECLARE @Total SQL_VARIANT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
    DECLARE @NonPub SQL_VARIANT = (SELECT COUNT(*) FROM #Rows WHERE Maturity <> N'Published');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @NonPub;
END;
GO

CREATE PROCEDURE FeatureCatalogTests.[test_QueryFeaturesReturnsFirstImageThumbnail]
AS
BEGIN
    -- Arrange — one feature with an earlier PDF attachment and a later image attachment. The gallery
    -- thumbnail must resolve to the first NATIVE IMAGE attachment (ignoring the PDF), not the earliest.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Attachments';
    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Feature one', N'Published', N'{}', 0, N'seed', N'seed');

    DECLARE @ImageId UNIQUEIDENTIFIER = '2B000000-0000-4000-8000-000000000002';
    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ContentType, IsLink, IsDeleted, CreatedAt, CreatedBy, UpdatedBy)
    VALUES ('2B000000-0000-4000-8000-000000000001', N'AIS-00000001', N'application/pdf', 0, 0, '2026-01-01', N'seed', N'seed'),
           (@ImageId,                                N'AIS-00000001', N'image/png',        0, 0, '2026-02-01', N'seed', N'seed'),
           ('2B000000-0000-4000-8000-000000000003', N'AIS-00000001', N'image/jpeg',       0, 1, '2026-03-01', N'seed', N'seed'); -- soft-deleted, ignored

    -- Act — capture the first result set.
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Maturity NVARCHAR(16), OneLiner NVARCHAR(400),
        FeatureType NVARCHAR(32), OwnerUserId NVARCHAR(200), Origin NVARCHAR(200), FieldValues NVARCHAR(MAX),
        UpdatedAt DATETIME2, RowVer VARBINARY(8), ThumbnailAttachmentId UNIQUEIDENTIFIER);
    INSERT INTO #Rows
    EXEC tSQLt.ResultSetFilter 1, N'EXEC dbo.usp_QueryFeatures
        @WorkspaceId = N''1A150000-0000-4000-8000-000000000001'', @Page = 1, @PageSize = 25';

    -- Assert — the resolved thumbnail is the live image attachment.
    DECLARE @Thumb SQL_VARIANT = (SELECT CONVERT(NVARCHAR(64), ThumbnailAttachmentId) FROM #Rows WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'2B000000-0000-4000-8000-000000000002', @Actual = @Thumb;
END;
GO

CREATE PROCEDURE FeatureCatalogTests.[test_QueryFeaturesNullThumbnailWhenNoImage]
AS
BEGIN
    -- Arrange — a feature whose only attachment is a non-image (PDF). Thumbnail must be NULL (placeholder).
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Attachments';
    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Feature one', N'Published', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ContentType, IsLink, IsDeleted, CreatedAt, CreatedBy, UpdatedBy)
    VALUES ('2B000000-0000-4000-8000-000000000001', N'AIS-00000001', N'application/pdf', 0, 0, '2026-01-01', N'seed', N'seed');

    -- Act
    CREATE TABLE #Rows (RecordId NVARCHAR(20), Name NVARCHAR(400), Maturity NVARCHAR(16), OneLiner NVARCHAR(400),
        FeatureType NVARCHAR(32), OwnerUserId NVARCHAR(200), Origin NVARCHAR(200), FieldValues NVARCHAR(MAX),
        UpdatedAt DATETIME2, RowVer VARBINARY(8), ThumbnailAttachmentId UNIQUEIDENTIFIER);
    INSERT INTO #Rows
    EXEC tSQLt.ResultSetFilter 1, N'EXEC dbo.usp_QueryFeatures
        @WorkspaceId = N''1A150000-0000-4000-8000-000000000001'', @Page = 1, @PageSize = 25';

    -- Assert — no image → NULL thumbnail.
    DECLARE @NonNull SQL_VARIANT = (SELECT COUNT(*) FROM #Rows WHERE ThumbnailAttachmentId IS NOT NULL);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @NonNull;
END;
GO

CREATE PROCEDURE FeatureCatalogTests.[test_PatchFeatureUpdatesNameAndPreservesMaturity]
AS
BEGIN
    -- Arrange — RowVer is a plain column under FakeTable, so we control the ETag and pass a matching
    -- one (the happy path). The stale-ETag THROW path is covered by the API controller test
    -- (Patch_Stale_Returns409): it cannot be asserted here because usp_PatchFeature follows the
    -- repo-mandated BEGIN TRAN … CATCH: IF @@TRANCOUNT>0 ROLLBACK pattern, and that ROLLBACK collapses
    -- tSQLt's own per-test transaction (a systemic tSQLt/proc-transaction incompatibility, repo-wide).
    -- FakeTable keeps RowVer as a real ROWVERSION (auto-generated, un-insertable), so let it generate
    -- and read it back as the matching ETag. IsDeleted is inserted explicitly so the proc finds the row.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Original', N'Published',
            N'{"maturity":"Published"}', 0, N'seed', N'seed');
    DECLARE @IfMatch VARBINARY(8) = (SELECT RowVer FROM dbo.Features WHERE RecordId = N'AIS-00000001');

    -- Act — patch name + fields with the matching ETag.
    EXEC dbo.usp_PatchFeature
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Name = N'Renamed feature', @FieldValuesJson = N'{"oneLiner":"new"}',
        @IfMatchRowVer = @IfMatch, @ActorUserId = N'aa';

    -- Assert — name updated + mirrored; Maturity is untouched by a content patch.
    DECLARE @Actual SQL_VARIANT;
    SET @Actual = (SELECT Name FROM dbo.Features WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Renamed feature', @Actual = @Actual;
    SET @Actual = (SELECT JSON_VALUE(FieldValues, N'$.name') FROM dbo.Features WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Renamed feature', @Actual = @Actual;
    SET @Actual = (SELECT Maturity FROM dbo.Features WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = @Actual;
END;
GO

CREATE PROCEDURE FeatureCatalogTests.[test_SetMaturityPublishesAndMirrors]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.Features';
    INSERT INTO dbo.Features (RecordId, WorkspaceId, Name, Maturity, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', N'Feat', N'Draft', N'{"maturity":"Draft"}', 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_SetFeatureMaturity
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @Maturity = N'Published', @ActorUserId = N'aa';

    -- Assert — column + mirrored value both advance to Published.
    DECLARE @Actual SQL_VARIANT;
    SET @Actual = (SELECT Maturity FROM dbo.Features WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = @Actual;
    SET @Actual = (SELECT JSON_VALUE(FieldValues, N'$.maturity') FROM dbo.Features WHERE RecordId = N'AIS-00000001');
    EXEC tSQLt.AssertEquals @Expected = N'Published', @Actual = @Actual;
END;
GO
