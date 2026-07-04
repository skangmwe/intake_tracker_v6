-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: DATA migration. Seeds the canonical §17 Request field schema on the
--              AI Solutions workspace (the superset — all [S], [A], ● fields). Platform
--              fields ([P]) are NOT seeded here; they render as a read-only band read
--              directly from dbo.PlatformField (slice 1) — one central definition per
--              firm, not duplicated per workspace (decision recorded in decisions.md).
--
--              Seeds: FieldDefinition rows, SelectOption sets where the spec names the
--              values (Dept/PG/Client per §17.3; AI Outcome per §8/§17.9), DerivedField
--              config (Priority Score §3.3, Display Status + Mirror Status §3.4), and the
--              §17.10 condition-engine rules (Existing Solution show/hide, Client/Matter
--              conditional-required, Hold reason show). Other select fields ship
--              option-less — admins configure them (S30). Per-stage visibility (§17.10)
--              uses the six canonical stage keys: intake, discovery, build, qa, deploy,
--              post-launch (slice 4 seeds matching StageDefinition rows).
--
--              ProduceValue / DefaultValue may be a literal or a '@fieldKey' reference —
--              '@outcome' means "the value of the Outcome field" (the ConditionEngine
--              resolves it at read time). Idempotent (guarded by FieldKey).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws   UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions
DECLARE @Obj  NVARCHAR(16)     = N'Request';
DECLARE @Seed NVARCHAR(256)    = N'system-seed';
DECLARE @TriageStages NVARCHAR(200) = N'["discovery","build","qa","deploy","post-launch"]';
DECLARE @BuildStages  NVARCHAR(200) = N'["build","qa","deploy","post-launch"]';
DECLARE @DeployStages NVARCHAR(200) = N'["deploy","post-launch"]';
DECLARE @PostStages   NVARCHAR(200) = N'["post-launch"]';

-- (FieldKey, DisplayName, FieldType, Category, Section, IsRequired, IsReadOnly, SortOrder, VisibleStagesJson, MinValue, MaxValue)
DECLARE @Fields TABLE
(
    FieldKey          NVARCHAR(64),
    DisplayName       NVARCHAR(200),
    FieldType         NVARCHAR(32),
    Category          NVARCHAR(16),
    Section           NVARCHAR(64),
    IsRequired        BIT,
    IsReadOnly        BIT,
    SortOrder         INT,
    VisibleStagesJson NVARCHAR(MAX),
    MinValue          DECIMAL(18, 4),
    MaxValue          DECIMAL(18, 4)
);

INSERT INTO @Fields (FieldKey, DisplayName, FieldType, Category, Section, IsRequired, IsReadOnly, SortOrder, VisibleStagesJson, MinValue, MaxValue)
VALUES
    -- Lifecycle and status (§17.2). Stage options come from StageDefinition (slice 4), not SelectOption.
    (N'stage',                 N'Stage',                       N'SingleSelect',    N'WorkspaceLocal', N'Lifecycle & status', 0, 0,  1, NULL, NULL, NULL),
    (N'holdBlocked',           N'Hold / Blocked',              N'Boolean',         N'WorkspaceLocal', N'Lifecycle & status', 0, 0,  2, NULL, NULL, NULL),
    (N'holdReason',            N'Hold reason',                 N'ShortText',       N'WorkspaceLocal', N'Lifecycle & status', 0, 0,  3, NULL, NULL, NULL),
    (N'displayStatus',         N'Display Status',              N'DerivedCategory', N'WorkspaceLocal', N'Lifecycle & status', 0, 1,  4, NULL, NULL, NULL),
    (N'mirrorStatus',          N'Mirror Status',               N'DerivedCategory', N'AiSide',         N'Lifecycle & status', 0, 1,  5, NULL, NULL, NULL),
    -- Intake (§17.3). [S] crossing content; watchers is ● (backed by the Watchers object, slice 12).
    (N'name',                  N'Name',                        N'ShortText',       N'Crossing',       N'Intake',             1, 0, 10, NULL, NULL, NULL),
    (N'description',           N'Description',                 N'LongText',        N'Crossing',       N'Intake',             0, 0, 11, NULL, NULL, NULL),
    (N'workflowDetails',       N'Workflow Details',            N'LongText',        N'Crossing',       N'Intake',             0, 0, 12, NULL, NULL, NULL),
    (N'requestor',            N'Requestor',                    N'UserReference',   N'Crossing',       N'Intake',             1, 0, 13, NULL, NULL, NULL),
    (N'businessOwner',         N'Business Owner',              N'UserReference',   N'Crossing',       N'Intake',             0, 0, 14, NULL, NULL, NULL),
    (N'deptPgClient',          N'Dept / PG / Client',          N'SingleSelect',    N'Crossing',       N'Intake',             0, 0, 15, NULL, NULL, NULL),
    (N'clientNumber',          N'Client number',               N'ShortText',       N'Crossing',       N'Intake',             0, 0, 16, NULL, NULL, NULL),
    (N'matterNumber',          N'Matter number',               N'ShortText',       N'Crossing',       N'Intake',             0, 0, 17, NULL, NULL, NULL),
    (N'timing',                N'Timing',                      N'SingleSelect',    N'Crossing',       N'Intake',             0, 0, 18, NULL, NULL, NULL),
    (N'watchers',              N'Watchers',                    N'UserReference',   N'WorkspaceLocal', N'Intake',             0, 0, 19, NULL, NULL, NULL),
    -- Value mapping (§17.4). [S] crossing; Priority Score is ● (Calculation).
    (N'successOneSentence',    N'Success in one sentence',     N'ShortText',       N'Crossing',       N'Value mapping',      0, 0, 30, NULL, NULL, NULL),
    (N'costOfDoingNothing',    N'How often / cost of doing nothing', N'LongText',  N'Crossing',       N'Value mapping',      0, 0, 31, NULL, NULL, NULL),
    (N'whatsBeenTried',        N'What''s been tried',          N'LongText',        N'Crossing',       N'Value mapping',      0, 0, 32, NULL, NULL, NULL),
    (N'goalsExpectedImpact',   N'Goals / Expected Impact',     N'LongText',        N'Crossing',       N'Value mapping',      0, 0, 33, NULL, NULL, NULL),
    (N'businessValue',         N'Business Value',              N'Number',          N'Crossing',       N'Value mapping',      0, 0, 34, NULL, 1, 5),
    (N'efficiencyGain',        N'Efficiency Gain',             N'Number',          N'Crossing',       N'Value mapping',      0, 0, 35, NULL, 1, 5),
    (N'levelOfEffort',         N'Level of Effort',             N'Number',          N'Crossing',       N'Value mapping',      0, 0, 36, NULL, 1, 5),
    (N'priorityScore',         N'Priority Score',              N'Calculation',     N'WorkspaceLocal', N'Value mapping',      0, 1, 37, NULL, NULL, NULL),
    -- Solution details (§17.5). [S] crossing.
    (N'expectedUserCount',     N'Expected User Count',         N'Number',          N'Crossing',       N'Solution details',   0, 0, 40, NULL, NULL, NULL),
    (N'dataClassification',    N'Data Classification',         N'SingleSelect',    N'Crossing',       N'Solution details',   0, 0, 41, NULL, NULL, NULL),
    (N'complianceFlags',       N'Compliance Flags',            N'MultiSelect',     N'Crossing',       N'Solution details',   0, 0, 42, NULL, NULL, NULL),
    (N'solutionFormat',        N'Solution Format',             N'SingleSelect',    N'Crossing',       N'Solution details',   0, 0, 43, NULL, NULL, NULL),
    (N'existingSolution',      N'Existing Solution',           N'Boolean',         N'Crossing',       N'Solution details',   0, 0, 44, NULL, NULL, NULL),
    (N'existingSolutionDetail', N'Existing Solution — detail', N'LongText',        N'Crossing',       N'Solution details',   0, 0, 45, NULL, NULL, NULL),
    (N'thingsMustNotDo',       N'Things This Must NOT Do',     N'LongText',        N'Crossing',       N'Solution details',   0, 0, 46, NULL, NULL, NULL),
    -- Triage and classification (§17.7). [A]; visible from Discovery (§17.10).
    (N'assignedAnalyst',       N'Assigned Analyst',            N'UserReference',   N'AiSide',         N'Triage',             0, 0, 50, @TriageStages, NULL, NULL),
    (N'dueDate',               N'Due Date',                    N'Date',            N'AiSide',         N'Triage',             0, 0, 51, @TriageStages, NULL, NULL),
    (N'solutionTier',          N'Solution Tier',               N'SingleSelect',    N'AiSide',         N'Triage',             0, 0, 52, @TriageStages, NULL, NULL),
    (N'solutionPattern',       N'Solution Pattern',            N'MultiSelect',     N'AiSide',         N'Triage',             0, 0, 53, @TriageStages, NULL, NULL),
    (N'buildVsBuy',            N'Build vs Buy Decision',       N'SingleSelect',    N'AiSide',         N'Triage',             0, 0, 54, @TriageStages, NULL, NULL),
    (N'triageNotes',           N'Triage Notes',                N'LongText',        N'AiSide',         N'Triage',             0, 0, 55, @TriageStages, NULL, NULL),
    -- Build (§17.8). [A]; visible from Build.
    (N'repoUrl',               N'Project Folder / Repo URL',   N'Url',             N'AiSide',         N'Build',              0, 0, 60, @BuildStages, NULL, NULL),
    (N'buildStartDate',        N'Build Start Date',            N'Date',            N'AiSide',         N'Build',              0, 0, 61, @BuildStages, NULL, NULL),
    (N'techStack',             N'Tech / Stack',                N'MultiSelect',     N'AiSide',         N'Build',              0, 0, 62, @BuildStages, NULL, NULL),
    (N'buildNotes',            N'Build Notes',                 N'LongText',        N'AiSide',         N'Build',              0, 0, 63, @BuildStages, NULL, NULL),
    -- Deploy and outcome (§17.9). [A]; visible from Deploy.
    (N'deployDate',            N'Deploy Date',                 N'Date',            N'AiSide',         N'Deploy & outcome',   0, 0, 70, @DeployStages, NULL, NULL),
    (N'solutionUrl',           N'Solution URL',                N'Url',             N'AiSide',         N'Deploy & outcome',   0, 0, 71, @DeployStages, NULL, NULL),
    (N'outcome',               N'Outcome',                     N'SingleSelect',    N'AiSide',         N'Deploy & outcome',   0, 0, 72, @DeployStages, NULL, NULL),
    (N'outcomeNotes',          N'Outcome Notes',               N'LongText',        N'AiSide',         N'Deploy & outcome',   0, 0, 73, @DeployStages, NULL, NULL),
    -- Post-launch value (§17.11). [A]; visible on Post-launch.
    (N'benefitReviewDate',     N'Benefit-review date',         N'Date',            N'AiSide',         N'Post-launch value',  0, 0, 80, @PostStages, NULL, NULL),
    (N'benefitRealized',       N'Benefit realized',            N'LongText',        N'AiSide',         N'Post-launch value',  0, 0, 81, @PostStages, NULL, NULL);

BEGIN TRY
    BEGIN TRANSACTION;

    -- 1) FieldDefinition rows. CrossingToFieldKey is set only on the PG side (this is the
    --    AI-side target, so it is NULL here). Guarded by (workspace, object, key).
    INSERT INTO dbo.FieldDefinition
        (WorkspaceId, ObjectType, FieldKey, DisplayName, FieldType, Category, Section,
         IsRequired, IsReadOnly, SortOrder, VisibleStagesJson, MinValue, MaxValue, CreatedBy, UpdatedBy)
    SELECT @Ws, @Obj, f.FieldKey, f.DisplayName, f.FieldType, f.Category, f.Section,
           f.IsRequired, f.IsReadOnly, f.SortOrder, f.VisibleStagesJson, f.MinValue, f.MaxValue, @Seed, @Seed
    FROM @Fields f
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldDefinition d
        WHERE d.WorkspaceId = @Ws AND d.ObjectType = @Obj AND d.FieldKey = f.FieldKey AND d.IsDeleted = 0);

    -- Map FieldKey -> FieldDefinitionId for the child inserts.
    DECLARE @Map TABLE (FieldKey NVARCHAR(64) PRIMARY KEY, FieldDefinitionId UNIQUEIDENTIFIER);
    INSERT INTO @Map (FieldKey, FieldDefinitionId)
    SELECT d.FieldKey, d.FieldDefinitionId
    FROM dbo.FieldDefinition d
    WHERE d.WorkspaceId = @Ws AND d.ObjectType = @Obj AND d.IsDeleted = 0;

    -- 2) SelectOption sets (only where the spec names the values).
    DECLARE @Options TABLE (FieldKey NVARCHAR(64), OptionValue NVARCHAR(200), OptionLabel NVARCHAR(200), SortOrder INT);
    INSERT INTO @Options (FieldKey, OptionValue, OptionLabel, SortOrder)
    VALUES
        (N'deptPgClient', N'Dept',   N'Dept',   1),
        (N'deptPgClient', N'PG',     N'PG',     2),
        (N'deptPgClient', N'Client', N'Client', 3),
        (N'outcome', N'Live',      N'Live',      1),   -- Shipped—live renders as Live (§8)
        (N'outcome', N'Declined',  N'Declined',  2),
        (N'outcome', N'Withdrawn', N'Withdrawn', 3),
        (N'outcome', N'Duplicate', N'Duplicate', 4);

    INSERT INTO dbo.SelectOption (FieldDefinitionId, OptionValue, OptionLabel, SortOrder, CreatedBy, UpdatedBy)
    SELECT m.FieldDefinitionId, o.OptionValue, o.OptionLabel, o.SortOrder, @Seed, @Seed
    FROM @Options o
    INNER JOIN @Map m ON m.FieldKey = o.FieldKey
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.SelectOption s
        WHERE s.FieldDefinitionId = m.FieldDefinitionId AND s.OptionValue = o.OptionValue AND s.IsDeleted = 0);

    -- 3) DerivedField config headers.
    --    priorityScore: Calculation. displayStatus / mirrorStatus: DerivedCategory (default = Stage).
    DECLARE @Derived TABLE (FieldKey NVARCHAR(64), Kind NVARCHAR(16), Expression NVARCHAR(1000), DefaultValue NVARCHAR(400));
    INSERT INTO @Derived (FieldKey, Kind, Expression, DefaultValue)
    VALUES
        (N'priorityScore', N'Calculation',     N'businessValue + efficiencyGain - levelOfEffort', NULL),
        (N'displayStatus', N'DerivedCategory', NULL, N'@stage'),
        (N'mirrorStatus',  N'DerivedCategory', NULL, N'@stage');

    INSERT INTO dbo.DerivedField (FieldDefinitionId, Kind, Expression, DefaultValue, CreatedBy, UpdatedBy)
    SELECT m.FieldDefinitionId, d.Kind, d.Expression, d.DefaultValue, @Seed, @Seed
    FROM @Derived d
    INNER JOIN @Map m ON m.FieldKey = d.FieldKey
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.DerivedField x WHERE x.FieldDefinitionId = m.FieldDefinitionId AND x.IsDeleted = 0);

    -- 4) FieldRule rows. Target field = the field the rule acts on.
    --    (TargetKey, Action, WhenFieldKey, Comparator, CompareValue, ProduceValue, SortOrder)
    DECLARE @Rules TABLE (TargetKey NVARCHAR(64), [Action] NVARCHAR(16), WhenFieldKey NVARCHAR(64),
                          Comparator NVARCHAR(16), CompareValue NVARCHAR(400), ProduceValue NVARCHAR(400), SortOrder INT);
    INSERT INTO @Rules (TargetKey, [Action], WhenFieldKey, Comparator, CompareValue, ProduceValue, SortOrder)
    VALUES
        -- §17.10 conditional visibility / requirement.
        (N'holdReason',             N'Show',    N'holdBlocked',      N'eq', N'true',   NULL, 1),
        (N'existingSolutionDetail', N'Show',    N'existingSolution', N'eq', N'true',   NULL, 1),
        (N'clientNumber',           N'Require', N'deptPgClient',     N'eq', N'Client', NULL, 1),
        (N'matterNumber',           N'Require', N'clientNumber',     N'isSet', NULL,   NULL, 1),
        -- §3.4 Display Status (AI-side): Outcome -> Hold -> (default Stage).
        (N'displayStatus', N'ProduceValue', N'outcome',     N'isSet', NULL,   N'@outcome', 1),
        (N'displayStatus', N'ProduceValue', N'holdBlocked', N'eq',    N'true', N'On hold',  2),
        -- §3.4 Mirror Status (AI-side only): Outcome -> Hold -> Deploy/Post-launch collapse -> (default Stage).
        (N'mirrorStatus', N'ProduceValue', N'outcome',     N'isSet', NULL,          N'@outcome', 1),
        (N'mirrorStatus', N'ProduceValue', N'holdBlocked', N'eq',    N'true',        N'On hold',  2),
        (N'mirrorStatus', N'ProduceValue', N'stage',       N'eq',    N'deploy',      N'Deployed', 3),
        (N'mirrorStatus', N'ProduceValue', N'stage',       N'eq',    N'post-launch', N'Deployed', 4);

    INSERT INTO dbo.FieldRule (FieldDefinitionId, [Action], WhenFieldKey, Comparator, CompareValue, ProduceValue, SortOrder, CreatedBy, UpdatedBy)
    SELECT m.FieldDefinitionId, r.[Action], r.WhenFieldKey, r.Comparator, r.CompareValue, r.ProduceValue, r.SortOrder, @Seed, @Seed
    FROM @Rules r
    INNER JOIN @Map m ON m.FieldKey = r.TargetKey
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.FieldRule x
        WHERE x.FieldDefinitionId = m.FieldDefinitionId AND x.WhenFieldKey = r.WhenFieldKey
          AND x.[Action] = r.[Action] AND x.SortOrder = r.SortOrder AND x.IsDeleted = 0);

    -- 5) FieldRuleDependency edges (From depends on To). Calculation operands + rule/derivation sources.
    DECLARE @Deps TABLE (FromFieldKey NVARCHAR(64), ToFieldKey NVARCHAR(64));
    INSERT INTO @Deps (FromFieldKey, ToFieldKey)
    VALUES
        (N'priorityScore', N'businessValue'), (N'priorityScore', N'efficiencyGain'), (N'priorityScore', N'levelOfEffort'),
        (N'displayStatus', N'outcome'), (N'displayStatus', N'holdBlocked'), (N'displayStatus', N'stage'),
        (N'mirrorStatus',  N'outcome'), (N'mirrorStatus',  N'holdBlocked'), (N'mirrorStatus',  N'stage'),
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

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_019_SeedAiSolutionsRequestSchema')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260703_019_SeedAiSolutionsRequestSchema', SUSER_SNAME(), N'Slice 3 — seed §17 Request schema on AI Solutions workspace.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
