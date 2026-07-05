-- =============================================
-- tSQLt tests for the Attachments procs (Slice 11).
-- Covers: usp_CreateAttachment (member insert / non-member denied → no row, @Inserted 0),
--         usp_GetAttachmentsForRecord (member sees own side / non-member sees nothing /
--         soft-deleted excluded), usp_GetAttachmentById (member resolves / non-member denied),
--         usp_DeleteAttachment (member soft-deletes / non-member denied → @Deleted 0).
-- Access is baked into every proc via a WorkspaceMembership join, so a forbidden or non-existent
-- record is indistinguishable from empty (the API answers 403, never disclosing existence).
-- database-testing.md (AAA, FakeTable).
-- =============================================

EXEC tSQLt.NewTestClass 'AttachmentsTests';
GO

-- Shared arrange: one Request on workspace WS, and a member (aa) of that workspace.
CREATE PROCEDURE AttachmentsTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Requests';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Attachments';

    INSERT INTO dbo.Requests (RecordId, WorkspaceId, LifecycleId, Name, Stage, FieldValues, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (N'AIS-00000001', '1A150000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
            N'Test', N'intake', N'{}', 0, N'seed', N'seed');
    INSERT INTO dbo.WorkspaceMembership (WorkspaceId, UserId, Level, IsDeleted)
    VALUES ('1A150000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', N'Member', 0);
END;
GO

CREATE PROCEDURE AttachmentsTests.[test_CreateInsertsForMember]
AS
BEGIN
    -- Act
    DECLARE @Inserted BIT;
    EXEC dbo.usp_CreateAttachment
        @AttachmentId = '33333333-3333-4333-8333-333333333333',
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @FileName = N'brief.pdf', @ContentType = N'application/pdf', @SizeBytes = 2048,
        @BlobPath = N'1a15.../AIS-00000001/3333/brief.pdf', @IsLink = 0, @ExternalUrl = NULL,
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @Inserted = @Inserted OUTPUT;

    -- Assert
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Inserted;
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Attachments WHERE AttachmentId = '33333333-3333-4333-8333-333333333333');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE AttachmentsTests.[test_CreateDeniedForNonMember]
AS
BEGIN
    -- Act — caller (cc) is not a member of the record's workspace.
    DECLARE @Inserted BIT;
    EXEC dbo.usp_CreateAttachment
        @AttachmentId = '44444444-4444-4444-8444-444444444444',
        @RecordId = N'AIS-00000001', @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @FileName = N'intruder.pdf', @ContentType = N'application/pdf', @SizeBytes = 1,
        @BlobPath = N'x', @IsLink = 0, @ExternalUrl = NULL,
        @ActorUserId = '00000000-0000-4000-8000-0000000000cc', @Inserted = @Inserted OUTPUT;

    -- Assert — no row written, @Inserted 0 (the API turns this into a 403).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Inserted;
    DECLARE @Count INT = (SELECT COUNT(*) FROM dbo.Attachments);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO

CREATE PROCEDURE AttachmentsTests.[test_ListReturnsLiveForMemberExcludesSoftDeleted]
AS
BEGIN
    -- Arrange — one live attachment and one soft-deleted, both on the member's workspace.
    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes, BlobPath, IsLink, ExternalUrl, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', N'Request', '1A150000-0000-4000-8000-000000000001', N'live.pdf', N'application/pdf', 10, N'p1', 0, NULL, 0, N'aa', N'aa'),
           (NEWID(), N'AIS-00000001', N'Request', '1A150000-0000-4000-8000-000000000001', N'gone.pdf', N'application/pdf', 10, N'p2', 0, NULL, 1, N'aa', N'aa');

    -- Act
    CREATE TABLE #List (AttachmentId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16),
        WorkspaceId UNIQUEIDENTIFIER, FileName NVARCHAR(400), ContentType NVARCHAR(200), SizeBytes BIGINT,
        IsLink BIT, ExternalUrl NVARCHAR(2048), CreatedAt DATETIME2, CreatedBy NVARCHAR(256));
    INSERT INTO #List
    EXEC dbo.usp_GetAttachmentsForRecord @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — only the live row; the soft-deleted one is excluded.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #List);
    DECLARE @Name NVARCHAR(400) = (SELECT TOP 1 FileName FROM #List);
    EXEC tSQLt.AssertEquals @Expected = N'live.pdf', @Actual = @Name;
END;
GO

CREATE PROCEDURE AttachmentsTests.[test_ListReturnsNothingForNonMember]
AS
BEGIN
    -- Arrange — an attachment exists but the caller has no membership.
    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes, BlobPath, IsLink, ExternalUrl, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), N'AIS-00000001', N'Request', '1A150000-0000-4000-8000-000000000001', N'secret.pdf', N'application/pdf', 10, N'p1', 0, NULL, 0, N'aa', N'aa');

    -- Act
    CREATE TABLE #List (AttachmentId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), ObjectType NVARCHAR(16),
        WorkspaceId UNIQUEIDENTIFIER, FileName NVARCHAR(400), ContentType NVARCHAR(200), SizeBytes BIGINT,
        IsLink BIT, ExternalUrl NVARCHAR(2048), CreatedAt DATETIME2, CreatedBy NVARCHAR(256));
    INSERT INTO #List
    EXEC dbo.usp_GetAttachmentsForRecord @RecordId = N'AIS-00000001', @UserId = '00000000-0000-4000-8000-0000000000ff';

    -- Assert — a non-member sees nothing (API answers 403, never disclosing existence).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #List);
END;
GO

CREATE PROCEDURE AttachmentsTests.[test_GetByIdResolvesForMemberDeniesNonMember]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes, BlobPath, IsLink, ExternalUrl, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('55555555-5555-4555-8555-555555555555', N'AIS-00000001', N'Request', '1A150000-0000-4000-8000-000000000001', N'doc.pdf', N'application/pdf', 10, N'the/blob/path', 0, NULL, 0, N'aa', N'aa');

    -- Act (member)
    CREATE TABLE #Member (AttachmentId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER,
        FileName NVARCHAR(400), ContentType NVARCHAR(200), SizeBytes BIGINT, BlobPath NVARCHAR(1024), IsLink BIT, ExternalUrl NVARCHAR(2048));
    INSERT INTO #Member
    EXEC dbo.usp_GetAttachmentById @AttachmentId = '55555555-5555-4555-8555-555555555555', @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Act (non-member)
    CREATE TABLE #NonMember (AttachmentId UNIQUEIDENTIFIER, RecordId NVARCHAR(20), WorkspaceId UNIQUEIDENTIFIER,
        FileName NVARCHAR(400), ContentType NVARCHAR(200), SizeBytes BIGINT, BlobPath NVARCHAR(1024), IsLink BIT, ExternalUrl NVARCHAR(2048));
    INSERT INTO #NonMember
    EXEC dbo.usp_GetAttachmentById @AttachmentId = '55555555-5555-4555-8555-555555555555', @UserId = '00000000-0000-4000-8000-0000000000ff';

    -- Assert — member resolves the row (and its BlobPath); non-member gets nothing.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = (SELECT COUNT(*) FROM #Member);
    DECLARE @Path NVARCHAR(1024) = (SELECT TOP 1 BlobPath FROM #Member);
    EXEC tSQLt.AssertEquals @Expected = N'the/blob/path', @Actual = @Path;
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = (SELECT COUNT(*) FROM #NonMember);
END;
GO

CREATE PROCEDURE AttachmentsTests.[test_DeleteSoftDeletesForMember]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes, BlobPath, IsLink, ExternalUrl, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('66666666-6666-4666-8666-666666666666', N'AIS-00000001', N'Request', '1A150000-0000-4000-8000-000000000001', N'doc.pdf', N'application/pdf', 10, N'p', 0, NULL, 0, N'aa', N'aa');

    -- Act
    DECLARE @Deleted BIT;
    EXEC dbo.usp_DeleteAttachment @AttachmentId = '66666666-6666-4666-8666-666666666666',
        @ActorUserId = '00000000-0000-4000-8000-0000000000aa', @Deleted = @Deleted OUTPUT;

    -- Assert — soft-deleted (row still present, IsDeleted 1), @Deleted 1.
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Deleted;
    DECLARE @Flag BIT = (SELECT IsDeleted FROM dbo.Attachments WHERE AttachmentId = '66666666-6666-4666-8666-666666666666');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Flag;
END;
GO

CREATE PROCEDURE AttachmentsTests.[test_DeleteDeniedForNonMember]
AS
BEGIN
    -- Arrange
    INSERT INTO dbo.Attachments (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes, BlobPath, IsLink, ExternalUrl, IsDeleted, CreatedBy, UpdatedBy)
    VALUES ('77777777-7777-4777-8777-777777777777', N'AIS-00000001', N'Request', '1A150000-0000-4000-8000-000000000001', N'doc.pdf', N'application/pdf', 10, N'p', 0, NULL, 0, N'aa', N'aa');

    -- Act — non-member attempts delete.
    DECLARE @Deleted BIT;
    EXEC dbo.usp_DeleteAttachment @AttachmentId = '77777777-7777-4777-8777-777777777777',
        @ActorUserId = '00000000-0000-4000-8000-0000000000ff', @Deleted = @Deleted OUTPUT;

    -- Assert — nothing deleted, @Deleted 0 (API → 403).
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Deleted;
    DECLARE @Flag BIT = (SELECT IsDeleted FROM dbo.Attachments WHERE AttachmentId = '77777777-7777-4777-8777-777777777777');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Flag;
END;
GO
