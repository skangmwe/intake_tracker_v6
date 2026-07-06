-- =============================================
-- tSQLt tests for dbo.usp_ProvisionWorkspace (Slice 19 — Platform admin, S38).
-- Covers: happy-path clone (workspace + registry + admin membership + field schema),
-- the duplicate-prefix guard, the blank-name guard, and the unknown-admin guard.
-- =============================================

EXEC tSQLt.NewTestClass 'ProvisionWorkspaceTests';
GO

CREATE PROCEDURE ProvisionWorkspaceTests.[SetUp]
AS
BEGIN
    -- Fake every table the proc touches; the proc supplies all ids/values explicitly.
    EXEC tSQLt.FakeTable @TableName = 'dbo.Workspaces';
    EXEC tSQLt.FakeTable @TableName = 'dbo.PrefixRegistry';
    EXEC tSQLt.FakeTable @TableName = 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = 'dbo.SelectOption';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRule';
    EXEC tSQLt.FakeTable @TableName = 'dbo.DerivedField';
    EXEC tSQLt.FakeTable @TableName = 'dbo.FieldRuleDependency';
END;
GO

CREATE PROCEDURE ProvisionWorkspaceTests.[test_Clones_Workspace_Registry_Membership_And_Fields]
AS
BEGIN
    -- Arrange — template with one Request field (+ one select option) and an active admin.
    DECLARE @Template UNIQUEIDENTIFIER = NEWID();
    DECLARE @Admin    UNIQUEIDENTIFIER = NEWID();
    DECLARE @FieldId  UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, IsDeleted)
    VALUES (@Template, N'PG / Department Template', N'pg-dept-template', N'TMPL', 0, 0);
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES (@Admin, N'Ada Admin', N'ada@firm.example', 0, 0);
    INSERT INTO dbo.FieldDefinition
        (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category,
         IsRequired, IsReadOnly, IsPlatformDefined, AllowNewValues, SortOrder, IsRetired, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (@FieldId, @Template, N'Request', N'priority', N'Priority', N'Select', N'WorkspaceLocal',
         0, 0, 0, 0, 0, 0, 0, N'seed', N'seed');
    INSERT INTO dbo.SelectOption (SelectOptionId, FieldDefinitionId, OptionValue, OptionLabel, SortOrder, IsDeleted, CreatedBy, UpdatedBy)
    VALUES (NEWID(), @FieldId, N'high', N'High', 0, 0, N'seed', N'seed');

    -- Act
    CREATE TABLE #New (WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200), Kind NVARCHAR(32), Prefix NVARCHAR(16));
    INSERT INTO #New EXEC dbo.usp_ProvisionWorkspace
        @Name = N'Litigation', @Prefix = N'lit', @InitialAdminUserId = @Admin, @ActorUserId = N'actor';

    DECLARE @NewWs UNIQUEIDENTIFIER = (SELECT WorkspaceId FROM #New);

    -- Assert — workspace created as pg-dept with an upper-cased prefix
    DECLARE @Kind NVARCHAR(32) = (SELECT Kind FROM dbo.Workspaces WHERE WorkspaceId = @NewWs);
    EXEC tSQLt.AssertEqualsString @Expected = N'pg-dept', @Actual = @Kind;
    DECLARE @Prefix NVARCHAR(16) = (SELECT Prefix FROM dbo.Workspaces WHERE WorkspaceId = @NewWs);
    EXEC tSQLt.AssertEqualsString @Expected = N'LIT', @Actual = @Prefix;

    -- Registry row, admin membership, and cloned field all present on the new workspace
    DECLARE @Reg INT = (SELECT COUNT(*) FROM dbo.PrefixRegistry WHERE Prefix = N'LIT' AND WorkspaceId = @NewWs);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Reg;
    DECLARE @Mem INT = (SELECT COUNT(*) FROM dbo.WorkspaceMembership WHERE WorkspaceId = @NewWs AND UserId = @Admin AND [Level] = N'WorkspaceAdmin');
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Mem;
    DECLARE @Fields INT = (SELECT COUNT(*) FROM dbo.FieldDefinition WHERE WorkspaceId = @NewWs);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Fields;

    -- The cloned field's option was re-pointed to the NEW field id (remap worked)
    DECLARE @NewFieldId UNIQUEIDENTIFIER = (SELECT FieldDefinitionId FROM dbo.FieldDefinition WHERE WorkspaceId = @NewWs);
    DECLARE @Opts INT = (SELECT COUNT(*) FROM dbo.SelectOption WHERE FieldDefinitionId = @NewFieldId);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @Opts;
END;
GO

CREATE PROCEDURE ProvisionWorkspaceTests.[test_DuplicatePrefix_Throws]
AS
BEGIN
    DECLARE @Template UNIQUEIDENTIFIER = NEWID();
    DECLARE @Admin    UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, IsDeleted)
    VALUES (@Template, N'Template', N'pg-dept-template', N'TMPL', 0, 0);
    INSERT INTO dbo.Users (UserId, DisplayName, Email, IsDisabled, IsDeleted)
    VALUES (@Admin, N'Ada', N'ada@firm.example', 0, 0);
    -- An existing prefix registry row collides.
    INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, CreatedBy, UpdatedBy)
    VALUES (N'LIT', NEWID(), N'Litigation', N'seed', N'seed');

    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%already in use%';
    EXEC dbo.usp_ProvisionWorkspace @Name = N'Litigation 2', @Prefix = N'LIT', @InitialAdminUserId = @Admin, @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE ProvisionWorkspaceTests.[test_BlankName_Throws]
AS
BEGIN
    DECLARE @Rando UNIQUEIDENTIFIER = NEWID();
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%name is required%';
    EXEC dbo.usp_ProvisionWorkspace @Name = N'   ', @Prefix = N'ABC', @InitialAdminUserId = @Rando, @ActorUserId = N'actor';
END;
GO

CREATE PROCEDURE ProvisionWorkspaceTests.[test_UnknownAdmin_Throws]
AS
BEGIN
    DECLARE @Template UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, IsDeleted)
    VALUES (@Template, N'Template', N'pg-dept-template', N'TMPL', 0, 0);

    DECLARE @Rando UNIQUEIDENTIFIER = NEWID();
    EXEC tSQLt.ExpectException @ExpectedMessagePattern = '%active user%';
    EXEC dbo.usp_ProvisionWorkspace @Name = N'Litigation', @Prefix = N'LIT', @InitialAdminUserId = @Rando, @ActorUserId = N'actor';
END;
GO
