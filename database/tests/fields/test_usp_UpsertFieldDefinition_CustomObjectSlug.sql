-- =============================================
-- Author:      SP3 — Fields on custom objects
-- Description: usp_UpsertFieldDefinition preserves a custom-object slug longer than 16 chars
--              (would truncate under the old NVARCHAR(16) param), and a custom-object field with a
--              condition rule upserts without hitting the dropped CK_FieldRuleDependency_ObjectType.
-- =============================================
EXEC tSQLt.NewTestClass 'FieldsUpsertTests';
GO

CREATE PROCEDURE FieldsUpsertTests.[test long custom-object slug survives the upsert round-trip]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'thirdpartyriskassessment';   -- 24 chars, > 16

    -- Act — the proc's required params are @WorkspaceId, @ObjectType, @FieldKey, @DisplayName,
    -- @FieldType, @Category, @ActorUserId (all others default). See usp_UpsertFieldDefinition.sql.
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'Owner',
        @DisplayName = N'Owner', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';

    DECLARE @Stored NVARCHAR(64) =
        (SELECT TOP 1 ObjectType FROM dbo.FieldDefinition WHERE WorkspaceId = @Ws AND FieldKey = N'Owner');

    -- Assert — the full 24-char slug is preserved, not truncated to 16.
    EXEC tSQLt.AssertEqualsString @Expected = @Slug, @Actual = @Stored;
END;
GO

CREATE PROCEDURE FieldsUpsertTests.[test custom-object field with a dependency upserts without a CHECK violation]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'thirdpartyriskassessment';   -- 24 chars, > 16

    -- Act — "Owner" is upserted first with no dependency. "Manager" is upserted second with a
    -- rule that reads Owner's value, expressed as an outgoing dependency edge Manager -> Owner.
    -- The proc inserts one dbo.FieldRuleDependency row per @DependenciesJson entry, keyed by
    -- (WorkspaceId, ObjectType, FromFieldKey, ToFieldKey) — exactly the insert that hit
    -- CK_FieldRuleDependency_ObjectType (IN 'Request','Task','Feature') before Task 1's migration
    -- dropped that CHECK and widened the column for custom-object slugs.
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'Owner',
        @DisplayName = N'Owner', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';

    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'Manager',
        @DisplayName = N'Manager', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester',
        @DependenciesJson = N'["Owner"]';

    -- Assert — exactly one live dependency row, keyed by the 24-char slug.
    DECLARE @Count INT =
        (SELECT COUNT(*) FROM dbo.FieldRuleDependency WHERE WorkspaceId = @Ws AND ObjectType = @Slug AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO
