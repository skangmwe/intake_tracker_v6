-- =============================================
-- tSQLt tests for the SavedView procs (Slice 14).
-- Covers: usp_UpsertSavedView (create; set-default clears the owner's prior default on the same
--         surface), usp_ListSavedViews (shared + own personal returned, another user's personal
--         hidden, scoped by object type), usp_DeleteSavedView (soft delete). AAA, FakeTable.
--
-- Scalar assertions read the value into a SQL_VARIANT local first — a parenthesised subquery is
-- not a valid EXEC argument in T-SQL (`EXEC proc @arg = (SELECT …)` raises Msg 102).
-- =============================================

EXEC tSQLt.NewTestClass 'SavedViewTests';
GO

CREATE PROCEDURE SavedViewTests.[test_UpsertCreatesView]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedView', @Defaults = 1;
    DECLARE @Out UNIQUEIDENTIFIER;

    -- Act
    EXEC dbo.usp_UpsertSavedView
        @SavedViewId = NULL, @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @ObjectType = N'Request', @Name = N'My open work', @Scope = N'personal',
        @OwnerUserId = '00000000-0000-4000-8000-0000000000aa', @IsDefault = 0,
        @ColumnsJson = N'["name","stage"]', @FiltersJson = N'{}', @SortJson = N'[]',
        @ActorUserId = N'aa', @OutSavedViewId = @Out OUTPUT;

    -- Assert
    DECLARE @Count SQL_VARIANT =
        (SELECT COUNT(*) FROM dbo.SavedView WHERE SavedViewId = @Out AND Name = N'My open work' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE SavedViewTests.[test_SetDefaultClearsPriorDefaultOnSameSurface]
AS
BEGIN
    -- Arrange — the owner already has a default view on the Request surface.
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedView', @Defaults = 1;
    DECLARE @First UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.SavedView (SavedViewId, WorkspaceId, ObjectType, Name, Scope, OwnerUserId, IsDefault,
                              ColumnsJson, FiltersJson, SortJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@First, '1A150000-0000-4000-8000-000000000001', N'Request', N'Old default', N'personal',
            '00000000-0000-4000-8000-0000000000aa', 1, N'[]', N'{}', N'[]', 0, N'seed', N'seed');
    DECLARE @Out UNIQUEIDENTIFIER;

    -- Act — create a new default on the same (owner, workspace, object type).
    EXEC dbo.usp_UpsertSavedView
        @SavedViewId = NULL, @WorkspaceId = '1A150000-0000-4000-8000-000000000001',
        @ObjectType = N'Request', @Name = N'New default', @Scope = N'personal',
        @OwnerUserId = '00000000-0000-4000-8000-0000000000aa', @IsDefault = 1,
        @ColumnsJson = N'[]', @FiltersJson = N'{}', @SortJson = N'[]',
        @ActorUserId = N'aa', @OutSavedViewId = @Out OUTPUT;

    -- Assert — exactly one default stands, and it is the new one.
    DECLARE @DefaultCount SQL_VARIANT =
        (SELECT COUNT(*) FROM dbo.SavedView WHERE OwnerUserId = '00000000-0000-4000-8000-0000000000aa' AND IsDefault = 1 AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @DefaultCount;
    DECLARE @OldFlag SQL_VARIANT = (SELECT IsDefault FROM dbo.SavedView WHERE SavedViewId = @First);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @OldFlag;
END;
GO

CREATE PROCEDURE SavedViewTests.[test_ListReturnsSharedAndOwnPersonalOnly]
AS
BEGIN
    -- Arrange — a shared view, the caller's own personal view, and another user's personal view,
    -- plus a Feature-surface view that must not appear on the Request picker.
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedView', @Defaults = 1;
    INSERT INTO dbo.SavedView (SavedViewId, WorkspaceId, ObjectType, Name, Scope, OwnerUserId, IsDefault,
                              ColumnsJson, FiltersJson, SortJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), '1A150000-0000-4000-8000-000000000001', N'Request', N'Team view', N'shared',
            '00000000-0000-4000-8000-0000000000bb', 0, N'[]', N'{}', N'[]', 0, N'seed', N'seed'),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'Request', N'My view', N'personal',
            '00000000-0000-4000-8000-0000000000aa', 0, N'[]', N'{}', N'[]', 0, N'seed', N'seed'),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'Request', N'Bob private', N'personal',
            '00000000-0000-4000-8000-0000000000bb', 0, N'[]', N'{}', N'[]', 0, N'seed', N'seed'),
           (NEWID(), '1A150000-0000-4000-8000-000000000001', N'Feature', N'Feature view', N'shared',
            '00000000-0000-4000-8000-0000000000bb', 0, N'[]', N'{}', N'[]', 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #Rows (SavedViewId UNIQUEIDENTIFIER, WorkspaceId UNIQUEIDENTIFIER, ObjectType NVARCHAR(16),
        Name NVARCHAR(200), Scope NVARCHAR(16), OwnerUserId UNIQUEIDENTIFIER, IsDefault BIT,
        ColumnsJson NVARCHAR(MAX), FiltersJson NVARCHAR(MAX), SortJson NVARCHAR(MAX),
        CreatedBy NVARCHAR(256), CreatedAt DATETIME2, UpdatedAt DATETIME2);
    INSERT INTO #Rows
    EXEC dbo.usp_ListSavedViews
        @WorkspaceId = '1A150000-0000-4000-8000-000000000001', @ObjectType = N'Request',
        @UserId = '00000000-0000-4000-8000-0000000000aa';

    -- Assert — the shared view + the caller's own personal view (2); Bob's private + the Feature
    -- surface view are excluded.
    DECLARE @Total SQL_VARIANT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @Total;
    DECLARE @BobPrivate SQL_VARIANT = (SELECT COUNT(*) FROM #Rows WHERE Name = N'Bob private');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @BobPrivate;
    DECLARE @FeatureRows SQL_VARIANT = (SELECT COUNT(*) FROM #Rows WHERE ObjectType = N'Feature');
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @FeatureRows;
END;
GO

CREATE PROCEDURE SavedViewTests.[test_DeleteSoftDeletesView]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.SavedView', @Defaults = 1;
    DECLARE @Id UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.SavedView (SavedViewId, WorkspaceId, ObjectType, Name, Scope, OwnerUserId, IsDefault,
                              ColumnsJson, FiltersJson, SortJson, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@Id, '1A150000-0000-4000-8000-000000000001', N'Request', N'Doomed', N'personal',
            '00000000-0000-4000-8000-0000000000aa', 0, N'[]', N'{}', N'[]', 0, N'seed', N'seed');

    -- Act
    EXEC dbo.usp_DeleteSavedView @SavedViewId = @Id, @ActorUserId = N'aa';

    -- Assert — soft-deleted (row remains, flag set).
    DECLARE @Flag SQL_VARIANT = (SELECT IsDeleted FROM dbo.SavedView WHERE SavedViewId = @Id);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Flag;
END;
GO
