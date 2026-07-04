-- =============================================
-- tSQLt tests for dbo.usp_UpdatePlatformField and dbo.usp_GetPlatformFields
-- (Slice 3 — Platform field schema, S34).
-- Covers: happy-path definition edit, the system-immutable guard, the not-found error,
-- and the read proc's soft-delete exclusion.
-- =============================================

EXEC tSQLt.NewTestClass 'PlatformFieldTests';
GO

CREATE PROCEDURE PlatformFieldTests.[test_UpdatesEditablePlatformFieldName]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformField';
    INSERT INTO dbo.PlatformField (PlatformFieldId, FieldKey, DisplayName, FieldType, Category, IsSystemImmutable, HasManualWritePath, IsDeleted)
    VALUES (NEWID(), N'legacy-id', N'Legacy ID', N'Text', N'Platform', 0, 1, 0);

    -- Act
    EXEC dbo.usp_UpdatePlatformField @FieldKey = N'legacy-id', @DisplayName = N'Legacy Identifier', @ActorUserId = N'test-actor';

    -- Assert
    DECLARE @Name NVARCHAR(200) = (SELECT DisplayName FROM dbo.PlatformField WHERE FieldKey = N'legacy-id');
    EXEC tSQLt.AssertEqualsString @Expected = N'Legacy Identifier', @Actual = @Name;
END;
GO

CREATE PROCEDURE PlatformFieldTests.[test_SystemImmutableField_Throws]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformField';
    INSERT INTO dbo.PlatformField (PlatformFieldId, FieldKey, DisplayName, FieldType, Category, IsSystemImmutable, HasManualWritePath, IsDeleted)
    VALUES (NEWID(), N'record-id', N'Record ID', N'Text', N'System', 1, 0, 0);

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%system field%';
    EXEC dbo.usp_UpdatePlatformField @FieldKey = N'record-id', @DisplayName = N'Renamed', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE PlatformFieldTests.[test_UnknownField_Throws]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformField';

    -- Act + Assert
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%not found%';
    EXEC dbo.usp_UpdatePlatformField @FieldKey = N'nope', @DisplayName = N'X', @ActorUserId = N'test-actor';
END;
GO

CREATE PROCEDURE PlatformFieldTests.[test_GetPlatformFields_ExcludesSoftDeleted]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.PlatformField';
    INSERT INTO dbo.PlatformField (PlatformFieldId, FieldKey, DisplayName, FieldType, Category, IsSystemImmutable, HasManualWritePath, IsDeleted)
    VALUES
        (NEWID(), N'legacy-id',           N'Legacy ID',           N'Text',   N'Platform', 0, 1, 0),
        (NEWID(), N'retired-platform',    N'Retired',             N'Text',   N'Platform', 0, 1, 1); -- soft-deleted

    -- Act
    CREATE TABLE #Actual (PlatformFieldId UNIQUEIDENTIFIER, FieldKey NVARCHAR(64), DisplayName NVARCHAR(200),
        FieldType NVARCHAR(32), Category NVARCHAR(32), IsSystemImmutable BIT, HasManualWritePath BIT, SelectOptionsJson NVARCHAR(MAX));
    INSERT INTO #Actual EXEC dbo.usp_GetPlatformFields;

    -- Assert
    DECLARE @Count INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO
