-- =============================================
-- Author:      /dev-build-application (Slice 19 — Platform admin)
-- Create Date: 2026-07-06
-- Description: Provisions a new PG/Dept workspace by cloning the PG/Dept template (S38 —
--              BS §1.1, api-contracts §2 POST /workspaces). One transaction:
--                1. Validate name / prefix (blank -> 50070). Prefix is upper-cased and must be
--                   globally unique across Workspaces AND PrefixRegistry (collision -> 50071,
--                   which the service maps to 409 duplicate-prefix).
--                2. Resolve the template by Kind='pg-dept-template' (missing -> 50072) and the
--                   initial admin (unknown/inactive -> 50073).
--                3. Insert the Workspace (Kind='pg-dept', NextSequence=0 -> first minted record
--                   is PREFIX-00000001, BS §6.7) + its PrefixRegistry row + the initial admin's
--                   WorkspaceAdmin membership.
--                4. Clone the template's Request/Task/Feature FIELD SCHEMA — FieldDefinition (new
--                   ids via a #Map) then SelectOption / FieldRule / DerivedField through the map,
--                   and FieldRuleDependency (keyed by WorkspaceId + FieldKey, so only the
--                   workspace id changes). The template ships no lifecycle/stages/gates (only the
--                   AI Solutions workspace is seeded with those), so a fresh PG workspace has none
--                   either — matching the template; admins configure lifecycle via S31.
--              Returns the new workspace (id, name, kind, prefix). Not an access-gate proc — the
--              controller's Platform-admin AccessGuard is authoritative.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ProvisionWorkspace
    @Name               NVARCHAR(200),
    @Prefix             NVARCHAR(16),
    @InitialAdminUserId UNIQUEIDENTIFIER,
    @ActorUserId        NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @NameLocal   NVARCHAR(200)    = LTRIM(RTRIM(@Name));
    DECLARE @PrefixLocal NVARCHAR(16)     = UPPER(LTRIM(RTRIM(@Prefix)));
    DECLARE @AdminUserId UNIQUEIDENTIFIER = @InitialAdminUserId;
    DECLARE @Actor       NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now         DATETIME2        = SYSUTCDATETIME();

    IF @NameLocal IS NULL OR @NameLocal = N''
        THROW 50070, 'A workspace name is required.', 1;
    IF @PrefixLocal IS NULL OR @PrefixLocal = N''
        THROW 50070, 'A workspace prefix is required.', 1;

    -- Validate BEFORE opening a transaction so a guard THROW never issues a ROLLBACK (tSQLt-safe).
    -- The PrefixRegistry PK is the concurrency backstop on the prefix.
    IF EXISTS (SELECT 1 FROM dbo.Workspaces WHERE Prefix = @PrefixLocal AND IsDeleted = 0)
        OR EXISTS (SELECT 1 FROM dbo.PrefixRegistry WHERE Prefix = @PrefixLocal)
        THROW 50071, 'That prefix is already in use.', 1;

    DECLARE @TemplateId UNIQUEIDENTIFIER =
        (SELECT TOP (1) WorkspaceId FROM dbo.Workspaces WHERE Kind = N'pg-dept-template' AND IsDeleted = 0);

    IF @TemplateId IS NULL
        THROW 50072, 'The PG/Dept template workspace is not provisioned.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AdminUserId AND IsDeleted = 0 AND IsDisabled = 0)
        THROW 50073, 'The initial admin must be an active user.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @NewWorkspaceId UNIQUEIDENTIFIER = NEWID();

        INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, NextSequence, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        VALUES (@NewWorkspaceId, @NameLocal, N'pg-dept', @PrefixLocal, 0, @Actor, @Actor, @Now, @Now);

        INSERT INTO dbo.PrefixRegistry (Prefix, WorkspaceId, WorkspaceNameAtMint, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        VALUES (@PrefixLocal, @NewWorkspaceId, @NameLocal, @Actor, @Actor, @Now, @Now);

        INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, [Level], CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        VALUES (NEWID(), @NewWorkspaceId, @AdminUserId, N'WorkspaceAdmin', @Actor, @Actor, @Now, @Now);

        -- ── Clone FieldDefinition (remap ids so children can be re-pointed) ───────
        DECLARE @Map TABLE (OldId UNIQUEIDENTIFIER PRIMARY KEY, NewId UNIQUEIDENTIFIER);

        INSERT INTO @Map (OldId, NewId)
        SELECT fd.FieldDefinitionId, NEWID()
        FROM dbo.FieldDefinition AS fd
        WHERE fd.WorkspaceId = @TemplateId AND fd.IsDeleted = 0;

        INSERT INTO dbo.FieldDefinition
            (FieldDefinitionId, WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Section,
             HelpText, IsRequired, IsReadOnly, IsPlatformDefined, PlatformFieldKey, VisibleStagesJson,
             CrossingToFieldKey, MinValue, MaxValue, AllowNewValues, SortOrder, IsRetired, RetiredAt,
             CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT
            map.NewId, @NewWorkspaceId, fd.ObjectType, fd.FieldKey, fd.DisplayName, fd.FieldType, fd.Category, fd.Section,
            fd.HelpText, fd.IsRequired, fd.IsReadOnly, fd.IsPlatformDefined, fd.PlatformFieldKey, fd.VisibleStagesJson,
            fd.CrossingToFieldKey, fd.MinValue, fd.MaxValue, fd.AllowNewValues, fd.SortOrder, fd.IsRetired, fd.RetiredAt,
            @Actor, @Actor, @Now, @Now
        FROM dbo.FieldDefinition AS fd
        INNER JOIN @Map AS map ON map.OldId = fd.FieldDefinitionId
        WHERE fd.WorkspaceId = @TemplateId AND fd.IsDeleted = 0;

        -- ── Clone SelectOption through the id map ────────────────────────────────
        INSERT INTO dbo.SelectOption
            (SelectOptionId, FieldDefinitionId, OptionValue, OptionLabel, SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT NEWID(), map.NewId, opt.OptionValue, opt.OptionLabel, opt.SortOrder, @Actor, @Actor, @Now, @Now
        FROM dbo.SelectOption AS opt
        INNER JOIN @Map AS map ON map.OldId = opt.FieldDefinitionId
        WHERE opt.IsDeleted = 0;

        -- ── Clone FieldRule through the id map ───────────────────────────────────
        INSERT INTO dbo.FieldRule
            (FieldRuleId, FieldDefinitionId, [Action], WhenFieldKey, Comparator, CompareValue, ProduceValue,
             SortOrder, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT NEWID(), map.NewId, fieldRule.[Action], fieldRule.WhenFieldKey, fieldRule.Comparator, fieldRule.CompareValue, fieldRule.ProduceValue,
               fieldRule.SortOrder, @Actor, @Actor, @Now, @Now
        FROM dbo.FieldRule AS fieldRule
        INNER JOIN @Map AS map ON map.OldId = fieldRule.FieldDefinitionId
        WHERE fieldRule.IsDeleted = 0;

        -- ── Clone DerivedField through the id map ────────────────────────────────
        INSERT INTO dbo.DerivedField
            (DerivedFieldId, FieldDefinitionId, Kind, Expression, DefaultValue, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT NEWID(), map.NewId, derived.Kind, derived.Expression, derived.DefaultValue, @Actor, @Actor, @Now, @Now
        FROM dbo.DerivedField AS derived
        INNER JOIN @Map AS map ON map.OldId = derived.FieldDefinitionId
        WHERE derived.IsDeleted = 0;

        -- ── Clone FieldRuleDependency (keyed by workspace + field keys) ──────────
        INSERT INTO dbo.FieldRuleDependency
            (FieldRuleDependencyId, WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt)
        SELECT NEWID(), @NewWorkspaceId, dep.ObjectType, dep.FromFieldKey, dep.ToFieldKey, @Actor, @Actor, @Now, @Now
        FROM dbo.FieldRuleDependency AS dep
        WHERE dep.WorkspaceId = @TemplateId AND dep.IsDeleted = 0;

        SELECT
            ws.WorkspaceId AS WorkspaceId,
            ws.Name        AS Name,
            ws.Kind        AS Kind,
            ws.Prefix      AS Prefix
        FROM dbo.Workspaces AS ws
        WHERE ws.WorkspaceId = @NewWorkspaceId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
