-- =============================================
-- Author:      SP3b Slice 2b — per-workspace local field extensions on Global objects
-- Description: The symmetric cross-namespace collision guard in usp_UpsertFieldDefinition. On a
--              Global custom object, dbo.CustomRecords.FieldValues is keyed by FieldKey, so a
--              platform-owned Global field (WorkspaceId NULL) and a workspace-local field
--              (WorkspaceId=<ws>) must never share (ObjectType, FieldKey). Both authoring paths
--              hit this one proc; the guard THROWs 50011 in either direction. It is a no-op on
--              built-in objects, where no WorkspaceId-NULL rows exist.
-- =============================================
EXEC tSQLt.NewTestClass 'FieldsGlobalLocalCollisionTests';
GO

CREATE PROCEDURE FieldsGlobalLocalCollisionTests.[test workspace-local field colliding with a platform Global field throws 50011]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'vendorreview';
    -- A platform-owned Global field already exists on the object (WorkspaceId NULL, Location='Global').
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, Location, IsDeleted)
    VALUES (NEWID(), NULL, @Slug, N'Priority', N'Global', 0);

    -- Act / Assert — a workspace creating a LOCAL field with the same key is rejected (50011).
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50011;
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'Priority',
        @DisplayName = N'Priority', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';
END;
GO

CREATE PROCEDURE FieldsGlobalLocalCollisionTests.[test platform Global field colliding with a workspace-local field throws 50011]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'vendorreview';
    -- A workspace already owns a LOCAL field with this key on the object.
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, Location, IsDeleted)
    VALUES (NEWID(), @Ws, @Slug, N'Priority', N'LocalWorkspace', 0);

    -- Act / Assert — a platform admin (WorkspaceId NULL) creating a Global field of the same key is rejected.
    EXEC tSQLt.ExpectException @ExpectedErrorNumber = 50011;
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = NULL, @ObjectType = @Slug, @FieldKey = N'Priority',
        @DisplayName = N'Priority', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'Global', @ActorUserId = N'platform';
END;
GO

CREATE PROCEDURE FieldsGlobalLocalCollisionTests.[test workspace-local field with a different key coexists and re-saves without tripping the guard]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    DECLARE @Slug NVARCHAR(64) = N'vendorreview';
    -- A platform Global field 'Priority' exists; the workspace adds a DIFFERENT local key.
    INSERT INTO dbo.FieldDefinition (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, Location, IsDeleted)
    VALUES (NEWID(), NULL, @Slug, N'Priority', N'Global', 0);

    -- Act — create then re-save the local field (different key → no collision, and the re-save
    -- matches only its own namespace row so the guard stays a no-op).
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'InternalOwner',
        @DisplayName = N'Internal Owner', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = @Slug, @FieldKey = N'InternalOwner',
        @DisplayName = N'Internal Owner (edited)', @FieldType = N'ShortText', @Category = N'WorkspaceLocal',
        @Location = N'LocalWorkspace', @ActorUserId = N'tester';

    -- Assert — exactly one live local row for that key, carrying the edited name.
    DECLARE @Name NVARCHAR(200) =
        (SELECT DisplayName FROM dbo.FieldDefinition
         WHERE WorkspaceId = @Ws AND ObjectType = @Slug AND FieldKey = N'InternalOwner' AND IsDeleted = 0);
    EXEC tSQLt.AssertEqualsString @Expected = N'Internal Owner (edited)', @Actual = @Name;
END;
GO

CREATE PROCEDURE FieldsGlobalLocalCollisionTests.[test workspace-authored Global field on a built-in object still upserts (guard is a no-op on built-ins)]
AS
BEGIN
    -- Arrange — empty FieldDefinition; no WorkspaceId-NULL rows exist on built-ins.
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
    DECLARE @Ws UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';

    -- Act — a workspace authors a Global field on the Request built-in (the "Platform-location" feature).
    EXEC dbo.usp_UpsertFieldDefinition
        @WorkspaceId = @Ws, @ObjectType = N'Request', @FieldKey = N'FirmWide',
        @DisplayName = N'Firm Wide', @FieldType = N'ShortText', @Category = N'Global',
        @Location = N'Global', @ActorUserId = N'tester';

    -- Assert — the row was written (the workspace-side guard found no WorkspaceId-NULL row to collide with).
    DECLARE @Count INT =
        (SELECT COUNT(*) FROM dbo.FieldDefinition
         WHERE WorkspaceId = @Ws AND ObjectType = N'Request' AND FieldKey = N'FirmWide' AND IsDeleted = 0);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Count;
END;
GO
