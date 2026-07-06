-- =============================================
-- tSQLt tests for dbo.usp_GetCrossingMap (Slice 19 — Platform admin, S35).
-- Covers: PG(template)->AI crossing pairs resolved by Kind, and exclusion of a retired source.
-- =============================================

EXEC tSQLt.NewTestClass 'CrossingMapTests';
GO

CREATE PROCEDURE CrossingMapTests.[SetUp]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
END;
GO

CREATE PROCEDURE CrossingMapTests.[Seed]
    @Ai UNIQUEIDENTIFIER,
    @Tmpl UNIQUEIDENTIFIER
AS
BEGIN
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, IsDeleted)
    VALUES (@Ai, N'AI Solutions', N'ai-solutions', 0), (@Tmpl, N'Template', N'pg-dept-template', 0);

    -- Source crossing field on the template -> AI target 'business-value' (1:1 same key).
    INSERT INTO dbo.FieldDefinition
        (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, CrossingToFieldKey, SortOrder, IsRetired, IsDeleted, CreatedBy, UpdatedBy)
    VALUES
        (NEWID(), @Tmpl, N'Request', N'business-value', N'Business Value', N'Number', N'Crossing', N'business-value', 0, 0, 0, N'seed', N'seed'),
        (NEWID(), @Ai,   N'Request', N'business-value', N'Business Value', N'Number', N'Crossing', N'business-value', 0, 0, 0, N'seed', N'seed');
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_ReturnsPgToAiPair]
AS
BEGIN
    DECLARE @Ai UNIQUEIDENTIFIER = NEWID(), @Tmpl UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.[Seed] @Ai = @Ai, @Tmpl = @Tmpl;

    CREATE TABLE #Rows (SourceFieldKey NVARCHAR(64), SourceDisplayName NVARCHAR(200), SourceFieldType NVARCHAR(32),
        TargetFieldKey NVARCHAR(64), TargetDisplayName NVARCHAR(200), TargetFieldType NVARCHAR(32));
    INSERT INTO #Rows EXEC dbo.usp_GetCrossingMap;

    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
    DECLARE @Target NVARCHAR(64) = (SELECT TargetFieldKey FROM #Rows);
    EXEC tSQLt.AssertEqualsString @Expected = N'business-value', @Actual = @Target;
END;
GO

CREATE PROCEDURE CrossingMapTests.[test_ExcludesRetiredSource]
AS
BEGIN
    DECLARE @Ai UNIQUEIDENTIFIER = NEWID(), @Tmpl UNIQUEIDENTIFIER = NEWID();
    EXEC CrossingMapTests.[Seed] @Ai = @Ai, @Tmpl = @Tmpl;
    -- Retire the template-side source field.
    UPDATE dbo.FieldDefinition SET IsRetired = 1 WHERE WorkspaceId = @Tmpl;

    CREATE TABLE #Rows (SourceFieldKey NVARCHAR(64), SourceDisplayName NVARCHAR(200), SourceFieldType NVARCHAR(32),
        TargetFieldKey NVARCHAR(64), TargetDisplayName NVARCHAR(200), TargetFieldType NVARCHAR(32));
    INSERT INTO #Rows EXEC dbo.usp_GetCrossingMap;

    DECLARE @Count INT = (SELECT COUNT(*) FROM #Rows);
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @Count;
END;
GO
