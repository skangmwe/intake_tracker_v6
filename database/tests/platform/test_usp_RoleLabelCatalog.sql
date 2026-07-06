-- =============================================
-- tSQLt tests for the S37 role-label CRUD procs (Slice 19 — Platform admin):
-- dbo.usp_CreateRoleLabel / usp_RenameRoleLabel / usp_RetireRoleLabel.
-- Covers: happy paths, blank/duplicate/unknown/collision guards, soft-delete reactivation,
-- and forward-only retire.
-- =============================================

EXEC tSQLt.NewTestClass 'RoleLabelCatalogTests';
GO

CREATE PROCEDURE RoleLabelCatalogTests.[test_Create_AddsLabelAfterMaxSort]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.RoleLabelCatalog', @Defaults = 1;
    INSERT INTO dbo.RoleLabelCatalog (RoleLabelId, Label, SortOrder, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), N'Existing', 3, N'seed', N'seed', 0);

    -- Act
    CREATE TABLE #Created (RoleLabelId UNIQUEIDENTIFIER, Label NVARCHAR(120), SortOrder INT);
    INSERT INTO #Created EXEC dbo.usp_CreateRoleLabel @Label = N'  New Label ', @ActorUserId = N'actor';

    -- Assert — trimmed label, sort after the current max (3 -> 4)
    DECLARE @Sort INT = (SELECT SortOrder FROM dbo.RoleLabelCatalog WHERE Label = N'New Label' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 4, @Actual = @Sort;
END;
GO

CREATE PROCEDURE RoleLabelCatalogTests.[test_Create_BlankLabel_Throws]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.RoleLabelCatalog', @Defaults = 1;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%cannot be blank%';
    EXEC dbo.usp_CreateRoleLabel @Label = N'   ', @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE RoleLabelCatalogTests.[test_Create_DuplicateActiveLabel_Throws]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.RoleLabelCatalog', @Defaults = 1;
    INSERT INTO dbo.RoleLabelCatalog (RoleLabelId, Label, SortOrder, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (NEWID(), N'InfoSec', 0, N'seed', N'seed', 0);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%already exists%';
    EXEC dbo.usp_CreateRoleLabel @Label = N'InfoSec', @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE RoleLabelCatalogTests.[test_Create_ReactivatesSoftDeletedLabel]
AS
BEGIN
    -- Arrange — a retired label of the same name
    EXEC tSQLt.FakeTable @TableName = 'dbo.RoleLabelCatalog', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.RoleLabelCatalog (RoleLabelId, Label, SortOrder, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@Id, N'GCO', 2, N'seed', N'seed', 1);

    -- Act
    CREATE TABLE #Created (RoleLabelId UNIQUEIDENTIFIER, Label NVARCHAR(120), SortOrder INT);
    INSERT INTO #Created EXEC dbo.usp_CreateRoleLabel @Label = N'GCO', @ActorUserId = N'actor';

    -- Assert — same row reactivated (not a new row), no duplicate
    DECLARE @ActiveCount INT = (SELECT COUNT(*) FROM dbo.RoleLabelCatalog WHERE Label = N'GCO' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @ActiveCount;
    DECLARE @ReactivatedId UNIQUEIDENTIFIER = (SELECT RoleLabelId FROM dbo.RoleLabelCatalog WHERE Label = N'GCO' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = @Id, @Actual = @ReactivatedId;
END;
GO

CREATE PROCEDURE RoleLabelCatalogTests.[test_Rename_UpdatesLabel]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.RoleLabelCatalog', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.RoleLabelCatalog (RoleLabelId, Label, SortOrder, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@Id, N'Old Name', 0, N'seed', N'seed', 0);

    CREATE TABLE #Renamed (RoleLabelId UNIQUEIDENTIFIER, Label NVARCHAR(120), SortOrder INT);
    INSERT INTO #Renamed EXEC dbo.usp_RenameRoleLabel @RoleLabelId = @Id, @Label = N'New Name', @ActorUserId = N'actor';

    DECLARE @Label NVARCHAR(120) = (SELECT Label FROM dbo.RoleLabelCatalog WHERE RoleLabelId = @Id);
    EXEC tSQLt.AssertEqualsString @Expected = N'New Name', @Actual = @Label;
END;
GO

CREATE PROCEDURE RoleLabelCatalogTests.[test_Rename_UnknownId_Throws]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.RoleLabelCatalog', @Defaults = 1;
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%does not exist%';
    EXEC dbo.usp_RenameRoleLabel @RoleLabelId = '00000000-0000-0000-0000-000000000001', @Label = N'X', @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE RoleLabelCatalogTests.[test_Rename_CollidesWithActiveLabel_Throws]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.RoleLabelCatalog', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.RoleLabelCatalog (RoleLabelId, Label, SortOrder, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@Id, N'Alpha', 0, N'seed', N'seed', 0), (NEWID(), N'Beta', 1, N'seed', N'seed', 0);

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%already exists%';
    EXEC dbo.usp_RenameRoleLabel @RoleLabelId = @Id, @Label = N'Beta', @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE RoleLabelCatalogTests.[test_Retire_SoftDeletesLabel]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.RoleLabelCatalog', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.RoleLabelCatalog (RoleLabelId, Label, SortOrder, CreatedBy, UpdatedBy, IsDeleted)
    VALUES (@Id, N'Data Privacy', 0, N'seed', N'seed', 0);

    EXEC dbo.usp_RetireRoleLabel @RoleLabelId = @Id, @ActorUserId = N'actor';

    DECLARE @Deleted BIT = (SELECT IsDeleted FROM dbo.RoleLabelCatalog WHERE RoleLabelId = @Id);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Deleted;
END;
GO
