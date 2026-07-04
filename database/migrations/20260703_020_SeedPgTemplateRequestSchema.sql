-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: DATA migration. Seeds the §17 Request schema on the PG/Dept template —
--              the same schema MINUS all [A] fields (§17: "the PG/Dept template ships
--              the same schema minus all [A] fields"). So: the [S] crossing set, the ●
--              workspace-local fields (Stage, Hold, Display Status, Priority Score,
--              Watchers), plus the template's STARTER LOCAL OUTCOME field (§1.1) which
--              closes PG-local requests and is distinct from the AI-side delivery
--              Outcome. Mirror Status ([A]) is NOT seeded here.
--
--              Crossing fields set CrossingToFieldKey = same FieldKey — the 1:1
--              same-named AI-side target seeded in migration 019 (§6.2). The PG template
--              seeds NO stages (§1.1), so the Stage field ships option-less. PG Display
--              Status derives from the LOCAL Outcome (§3.4), never the [A] Outcome, so the
--              §3.1 seed-rule constraint (reference only template-present fields) holds.
--              Idempotent (guarded by FieldKey).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws   UNIQUEIDENTIFIER = N'9C700000-0000-4000-8000-000000000001'; -- PG/Dept template
DECLARE @Obj  NVARCHAR(16)     = N'Request';
DECLARE @Seed NVARCHAR(256)    = N'system-seed';

-- (FieldKey, DisplayName, FieldType, Category, Section, IsRequired, IsReadOnly, SortOrder, CrossingToFieldKey, MinValue, MaxValue)
DECLARE @Fields TABLE
(
    FieldKey           NVARCHAR(64),
    DisplayName        NVARCHAR(200),
    FieldType          NVARCHAR(32),
    Category           NVARCHAR(16),
    Section            NVARCHAR(64),
    IsRequired         BIT,
    IsReadOnly         BIT,
    SortOrder          INT,
    CrossingToFieldKey NVARCHAR(64),
    MinValue           DECIMAL(18, 4),
    MaxValue           DECIMAL(18, 4)
);

INSERT INTO @Fields (FieldKey, DisplayName, FieldType, Category, Section, IsRequired, IsReadOnly, SortOrder, CrossingToFieldKey, MinValue, MaxValue)
VALUES
    -- Lifecycle and status (● — no stages seeded on the template, §1.1).
    (N'stage',                  N'Stage',                     N'SingleSelect',    N'WorkspaceLocal', N'Lifecycle & status', 0, 0,  1, NULL, NULL, NULL),
    (N'holdBlocked',            N'Hold / Blocked',            N'Boolean',         N'WorkspaceLocal', N'Lifecycle & status', 0, 0,  2, NULL, NULL, NULL),
    (N'holdReason',             N'Hold reason',               N'ShortText',       N'WorkspaceLocal', N'Lifecycle & status', 0, 0,  3, NULL, NULL, NULL),
    (N'displayStatus',          N'Display Status',            N'DerivedCategory', N'WorkspaceLocal', N'Lifecycle & status', 0, 1,  4, NULL, NULL, NULL),
    (N'localOutcome',           N'Outcome',                   N'SingleSelect',    N'WorkspaceLocal', N'Closure',            0, 0,  5, NULL, NULL, NULL),
    -- Intake [S] crossing set — CrossingToFieldKey = same key (the AI-side target). watchers is ●.
    (N'name',                   N'Name',                      N'ShortText',       N'Crossing',       N'Intake',             1, 0, 10, N'name', NULL, NULL),
    (N'description',            N'Description',               N'LongText',        N'Crossing',       N'Intake',             0, 0, 11, N'description', NULL, NULL),
    (N'workflowDetails',        N'Workflow Details',          N'LongText',        N'Crossing',       N'Intake',             0, 0, 12, N'workflowDetails', NULL, NULL),
    (N'requestor',              N'Requestor',                 N'UserReference',   N'Crossing',       N'Intake',             1, 0, 13, N'requestor', NULL, NULL),
    (N'businessOwner',          N'Business Owner',            N'UserReference',   N'Crossing',       N'Intake',             0, 0, 14, N'businessOwner', NULL, NULL),
    (N'deptPgClient',           N'Dept / PG / Client',        N'SingleSelect',    N'Crossing',       N'Intake',             0, 0, 15, N'deptPgClient', NULL, NULL),
    (N'clientNumber',           N'Client number',             N'ShortText',       N'Crossing',       N'Intake',             0, 0, 16, N'clientNumber', NULL, NULL),
    (N'matterNumber',           N'Matter number',             N'ShortText',       N'Crossing',       N'Intake',             0, 0, 17, N'matterNumber', NULL, NULL),
    (N'timing',                 N'Timing',                    N'SingleSelect',    N'Crossing',       N'Intake',             0, 0, 18, N'timing', NULL, NULL),
    (N'watchers',               N'Watchers',                  N'UserReference',   N'WorkspaceLocal', N'Intake',             0, 0, 19, NULL, NULL, NULL),
    -- Value mapping [S] + Priority Score ●.
    (N'successOneSentence',     N'Success in one sentence',   N'ShortText',       N'Crossing',       N'Value mapping',      0, 0, 30, N'successOneSentence', NULL, NULL),
    (N'costOfDoingNothing',     N'How often / cost of doing nothing', N'LongText', N'Crossing',      N'Value mapping',      0, 0, 31, N'costOfDoingNothing', NULL, NULL),
    (N'whatsBeenTried',         N'What''s been tried',        N'LongText',        N'Crossing',       N'Value mapping',      0, 0, 32, N'whatsBeenTried', NULL, NULL),
    (N'goalsExpectedImpact',    N'Goals / Expected Impact',   N'LongText',        N'Crossing',       N'Value mapping',      0, 0, 33, N'goalsExpectedImpact', NULL, NULL),
    (N'businessValue',          N'Business Value',            N'Number',          N'Crossing',       N'Value mapping',      0, 0, 34, N'businessValue', 1, 5),
    (N'efficiencyGain',         N'Efficiency Gain',           N'Number',          N'Crossing',       N'Value mapping',      0, 0, 35, N'efficiencyGain', 1, 5),
    (N'levelOfEffort',          N'Level of Effort',           N'Number',          N'Crossing',       N'Value mapping',      0, 0, 36, N'levelOfEffort', 1, 5),
    (N'priorityScore',          N'Priority Score',            N'Calculation',     N'WorkspaceLocal', N'Value mapping',      0, 1, 37, NULL, NULL, NULL),
    -- Solution details [S].
    (N'expectedUserCount',      N'Expected User Count',       N'Number',          N'Crossing',       N'Solution details',   0, 0, 40, N'expectedUserCount', NULL, NULL),
    (N'dataClassification',     N'Data Classification',       N'SingleSelect',    N'Crossing',       N'Solution details',   0, 0, 41, N'dataClassification', NULL, NULL),
    (N'complianceFlags',        N'Compliance Flags',          N'MultiSelect',     N'Crossing',       N'Solution details',   0, 0, 42, N'complianceFlags', NULL, NULL),
    (N'solutionFormat',         N'Solution Format',           N'SingleSelect',    N'Crossing',       N'Solution details',   0, 0, 43, N'solutionFormat', NULL, NULL),
    (N'existingSolution',       N'Existing Solution',         N'Boolean',         N'Crossing',       N'Solution details',   0, 0, 44, N'existingSolution', NULL, NULL),
    (N'existingSolutionDetail', N'Existing Solution — detail', N'LongText',       N'Crossing',       N'Solution details',   0, 0, 45, N'existingSolutionDetail', NULL, NULL),
    (N'thingsMustNotDo',        N'Things This Must NOT Do',   N'LongText',        N'Crossing',       N'Solution details',   0, 0, 46, N'thingsMustNotDo', NULL, NULL);

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.FieldDefinition
        (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Section,
         IsRequired, IsReadOnly, SortOrder, CrossingToFieldKey, MinValue, MaxValue, CreatedBy, UpdatedBy)
    SELECT @Ws, @Obj, f.FieldKey, f.DisplayName, f.FieldType, f.Category, f.Section,
           f.IsRequired, f.IsReadOnly, f.SortOrder, f.CrossingToFieldKey, f.MinValue, f.MaxValue, @Seed, @Seed
    FROM @Fields f
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldDefinition d
        WHERE d.WorkspaceId = @Ws AND d.ObjectType = @Obj AND d.FieldKey = f.FieldKey AND d.IsDeleted = 0);

    DECLARE @Map TABLE (FieldKey NVARCHAR(64) PRIMARY KEY, FieldDefinitionId UNIQUEIDENTIFIER);
    INSERT INTO @Map (FieldKey, FieldDefinitionId)
    SELECT d.FieldKey, d.FieldDefinitionId
    FROM dbo.FieldDefinition d
    WHERE d.WorkspaceId = @Ws AND d.ObjectType = @Obj AND d.IsDeleted = 0;

    -- SelectOption sets: Dept/PG/Client (§17.3) + the template's starter local Outcome (§1.1).
    DECLARE @Options TABLE (FieldKey NVARCHAR(64), OptionValue NVARCHAR(200), OptionLabel NVARCHAR(200), SortOrder INT);
    INSERT INTO @Options (FieldKey, OptionValue, OptionLabel, SortOrder)
    VALUES
        (N'deptPgClient', N'Dept',   N'Dept',   1),
        (N'deptPgClient', N'PG',     N'PG',     2),
        (N'deptPgClient', N'Client', N'Client', 3),
        (N'localOutcome', N'Resolved',  N'Resolved',  1),
        (N'localOutcome', N'Withdrawn', N'Withdrawn', 2),
        (N'localOutcome', N'Duplicate', N'Duplicate', 3);

    INSERT INTO dbo.SelectOption (FieldDefinitionId, OptionValue, OptionLabel, SortOrder, CreatedBy, UpdatedBy)
    SELECT m.FieldDefinitionId, o.OptionValue, o.OptionLabel, o.SortOrder, @Seed, @Seed
    FROM @Options o
    INNER JOIN @Map m ON m.FieldKey = o.FieldKey
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.SelectOption s
        WHERE s.FieldDefinitionId = m.FieldDefinitionId AND s.OptionValue = o.OptionValue AND s.IsDeleted = 0);

    -- DerivedField headers: Priority Score (Calculation) + Display Status (DerivedCategory, default Stage).
    DECLARE @Derived TABLE (FieldKey NVARCHAR(64), Kind NVARCHAR(16), Expression NVARCHAR(1000), DefaultValue NVARCHAR(400));
    INSERT INTO @Derived (FieldKey, Kind, Expression, DefaultValue)
    VALUES
        (N'priorityScore', N'Calculation',     N'businessValue + efficiencyGain - levelOfEffort', NULL),
        (N'displayStatus', N'DerivedCategory', NULL, N'@stage');

    INSERT INTO dbo.DerivedField (FieldDefinitionId, Kind, Expression, DefaultValue, CreatedBy, UpdatedBy)
    SELECT m.FieldDefinitionId, d.Kind, d.Expression, d.DefaultValue, @Seed, @Seed
    FROM @Derived d
    INNER JOIN @Map m ON m.FieldKey = d.FieldKey
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.DerivedField x WHERE x.FieldDefinitionId = m.FieldDefinitionId AND x.IsDeleted = 0);

    -- FieldRule rows. PG Display Status derives from the LOCAL Outcome (§3.4), not [A] Outcome.
    DECLARE @Rules TABLE (TargetKey NVARCHAR(64), [Action] NVARCHAR(16), WhenFieldKey NVARCHAR(64),
                          Comparator NVARCHAR(16), CompareValue NVARCHAR(400), ProduceValue NVARCHAR(400), SortOrder INT);
    INSERT INTO @Rules (TargetKey, [Action], WhenFieldKey, Comparator, CompareValue, ProduceValue, SortOrder)
    VALUES
        (N'holdReason',             N'Show',    N'holdBlocked',      N'eq', N'true',   NULL, 1),
        (N'existingSolutionDetail', N'Show',    N'existingSolution', N'eq', N'true',   NULL, 1),
        (N'clientNumber',           N'Require', N'deptPgClient',     N'eq', N'Client', NULL, 1),
        (N'matterNumber',           N'Require', N'clientNumber',     N'isSet', NULL,   NULL, 1),
        (N'displayStatus', N'ProduceValue', N'localOutcome', N'isSet', NULL,   N'@localOutcome', 1),
        (N'displayStatus', N'ProduceValue', N'holdBlocked',  N'eq',    N'true', N'On hold',       2);

    INSERT INTO dbo.FieldRule (FieldDefinitionId, [Action], WhenFieldKey, Comparator, CompareValue, ProduceValue, SortOrder, CreatedBy, UpdatedBy)
    SELECT m.FieldDefinitionId, r.[Action], r.WhenFieldKey, r.Comparator, r.CompareValue, r.ProduceValue, r.SortOrder, @Seed, @Seed
    FROM @Rules r
    INNER JOIN @Map m ON m.FieldKey = r.TargetKey
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldRule x
        WHERE x.FieldDefinitionId = m.FieldDefinitionId AND x.WhenFieldKey = r.WhenFieldKey
          AND x.[Action] = r.[Action] AND x.SortOrder = r.SortOrder AND x.IsDeleted = 0);

    -- FieldRuleDependency edges.
    DECLARE @Deps TABLE (FromFieldKey NVARCHAR(64), ToFieldKey NVARCHAR(64));
    INSERT INTO @Deps (FromFieldKey, ToFieldKey)
    VALUES
        (N'priorityScore', N'businessValue'), (N'priorityScore', N'efficiencyGain'), (N'priorityScore', N'levelOfEffort'),
        (N'displayStatus', N'localOutcome'), (N'displayStatus', N'holdBlocked'), (N'displayStatus', N'stage'),
        (N'holdReason', N'holdBlocked'),
        (N'existingSolutionDetail', N'existingSolution'),
        (N'clientNumber', N'deptPgClient'),
        (N'matterNumber', N'clientNumber');

    INSERT INTO dbo.FieldRuleDependency (WorkspaceId, ObjectType, FromFieldKey, ToFieldKey, CreatedBy, UpdatedBy)
    SELECT @Ws, @Obj, dep.FromFieldKey, dep.ToFieldKey, @Seed, @Seed
    FROM @Deps dep
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldRuleDependency x
        WHERE x.WorkspaceId = @Ws AND x.ObjectType = @Obj
          AND x.FromFieldKey = dep.FromFieldKey AND x.ToFieldKey = dep.ToFieldKey AND x.IsDeleted = 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_020_SeedPgTemplateRequestSchema')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260703_020_SeedPgTemplateRequestSchema', SUSER_SNAME(), N'Slice 3 — seed §17 Request schema (minus [A]) on PG/Dept template.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
