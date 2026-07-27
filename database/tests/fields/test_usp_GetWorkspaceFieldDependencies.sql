-- =============================================
-- tSQLt tests for dbo.usp_GetWorkspaceFieldDependencies (SP3b Slice 2a, Task 3).
-- Covers the Global-edge (WorkspaceId IS NULL) inheritance relax: a Global field's
-- dependency edge must surface both when read with @WorkspaceId=Guid.Empty (the platform
-- read-back path — Guid.Empty owns no rows) and when read with a real workspace's id
-- (the workspace graph-check path, which must see the Global edges it can reference).
-- =============================================

EXEC tSQLt.NewTestClass 'GetWorkspaceFieldDependenciesTests';
GO

CREATE PROCEDURE GetWorkspaceFieldDependenciesTests.[test_GlobalEdge_ReturnedWhenReadWithGuidEmptyWorkspace]
AS
BEGIN
    -- Arrange — a Global field's dependency edge (WorkspaceId IS NULL, migration 102).
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';

    INSERT INTO dbo.FieldRuleDependency (WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, IsDeleted)
    VALUES (NULL, N'vendorReview', N'globalDerived', N'globalBase', 0);

    -- Act — the platform read-back path reads with @WorkspaceId=Guid.Empty (owns no rows).
    DECLARE @Result TABLE (FromFieldKey NVARCHAR(64), ToFieldKey NVARCHAR(64));
    INSERT INTO @Result
    EXEC dbo.usp_GetWorkspaceFieldDependencies
        @WorkspaceId = '00000000-0000-0000-0000-000000000000', @ObjectType = N'vendorReview';

    -- Assert
    DECLARE @Count INT = (
        SELECT COUNT(*) FROM @Result WHERE FromFieldKey = N'globalDerived' AND ToFieldKey = N'globalBase');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldDependenciesTests.[test_GlobalEdge_ReturnedAlongsideWorkspacesOwnEdgesForRealWorkspace]
AS
BEGIN
    -- Arrange — a Global edge plus a real workspace's own edge on the same object type. A
    -- workspace's graph check must see both — the Global edge is inherited (mirrors
    -- usp_GetWorkspaceFields' Location='Global' inheritance), not just its own.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';

    INSERT INTO dbo.FieldRuleDependency (WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, IsDeleted)
    VALUES (NULL, N'vendorReview', N'globalDerived', N'globalBase', 0);
    INSERT INTO dbo.FieldRuleDependency (WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, IsDeleted)
    VALUES (@Ws, N'vendorReview', N'localDerived', N'localBase', 0);

    -- Act — a real workspace's own read.
    DECLARE @Result TABLE (FromFieldKey NVARCHAR(64), ToFieldKey NVARCHAR(64));
    INSERT INTO @Result
    EXEC dbo.usp_GetWorkspaceFieldDependencies @WorkspaceId = @Ws, @ObjectType = N'vendorReview';

    -- Assert — both edges present.
    DECLARE @TotalCount INT = (SELECT COUNT(*) FROM @Result);
    EXEC tSQLt.AssertEquals @Expected = 2, @Actual = @TotalCount;

    DECLARE @GlobalCount INT = (
        SELECT COUNT(*) FROM @Result WHERE FromFieldKey = N'globalDerived' AND ToFieldKey = N'globalBase');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @GlobalCount;

    DECLARE @LocalCount INT = (
        SELECT COUNT(*) FROM @Result WHERE FromFieldKey = N'localDerived' AND ToFieldKey = N'localBase');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @LocalCount;
END;
GO

CREATE PROCEDURE GetWorkspaceFieldDependenciesTests.[test_AnotherWorkspacesOwnEdge_IsNotReturned]
AS
BEGIN
    -- Arrange — the additive OR must not leak a foreign workspace's own (non-NULL) edge; only
    -- the caller's own edges and Global (NULL-workspace) edges are in scope.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000001';
    DECLARE @OtherWs UNIQUEIDENTIFIER = '1A150000-0000-4000-8000-000000000099';

    INSERT INTO dbo.FieldRuleDependency (WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, IsDeleted)
    VALUES (@OtherWs, N'vendorReview', N'foreignDerived', N'foreignBase', 0);

    -- Act
    DECLARE @Result TABLE (FromFieldKey NVARCHAR(64), ToFieldKey NVARCHAR(64));
    INSERT INTO @Result
    EXEC dbo.usp_GetWorkspaceFieldDependencies @WorkspaceId = @Ws, @ObjectType = N'vendorReview';

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM @Result);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO
