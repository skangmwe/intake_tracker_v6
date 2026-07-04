-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: DATA migration. Seeds the platform RoleLabelCatalog (AI Solutions Manager,
--              GCO, InfoSec, PG/Dept Lead, Data Privacy) and, on the AI Solutions
--              workspace, the default "Standard AI build" lifecycle with its six canonical
--              stages (each mapped to a status category) and the two seeded gates
--              (QA-readiness Build->QA; Post-launch-readiness Deploy->Post-launch) with
--              their team-only approver slots — per the prototype.
--
--              ApproverTeamMembership is intentionally NOT seeded: the prototype's named
--              people are mock fixtures, and seeding invented party names would violate the
--              firm's no-invented-facts rule. Real members are added by admins in S31 (or
--              accrue as users sign in); "N eligible" reads live from an empty roster.
--              Idempotent — guarded by fixed seed GUIDs / labels.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws       UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions
DECLARE @Seed     NVARCHAR(256)    = N'system-seed';
DECLARE @Lc       UNIQUEIDENTIFIER = N'11FE0000-0000-4000-8000-000000000001';

-- Fixed stage GUIDs so the gates can reference them deterministically.
DECLARE @SIntake     UNIQUEIDENTIFIER = N'57A60000-0000-4000-8000-000000000001';
DECLARE @SDiscovery  UNIQUEIDENTIFIER = N'57A60000-0000-4000-8000-000000000002';
DECLARE @SBuild      UNIQUEIDENTIFIER = N'57A60000-0000-4000-8000-000000000003';
DECLARE @SQa         UNIQUEIDENTIFIER = N'57A60000-0000-4000-8000-000000000004';
DECLARE @SDeploy     UNIQUEIDENTIFIER = N'57A60000-0000-4000-8000-000000000005';
DECLARE @SPost       UNIQUEIDENTIFIER = N'57A60000-0000-4000-8000-000000000006';

DECLARE @GQa   UNIQUEIDENTIFIER = N'6A7E0000-0000-4000-8000-000000000001';
DECLARE @GPost UNIQUEIDENTIFIER = N'6A7E0000-0000-4000-8000-000000000002';

BEGIN TRY
    BEGIN TRANSACTION;

    -- ── RoleLabelCatalog (platform-scope) ────────────────────────────────────
    ;WITH Roles(Label, SortOrder) AS (
        SELECT N'AI Solutions Manager', 0 UNION ALL
        SELECT N'GCO',                  1 UNION ALL
        SELECT N'InfoSec',              2 UNION ALL
        SELECT N'PG/Dept Lead',         3 UNION ALL
        SELECT N'Data Privacy',         4
    )
    INSERT INTO dbo.RoleLabelCatalog (Label, SortOrder, CreatedBy, UpdatedBy)
    SELECT r.Label, r.SortOrder, @Seed, @Seed
    FROM Roles AS r
    WHERE NOT EXISTS (SELECT 1 FROM dbo.RoleLabelCatalog AS c WHERE c.Label = r.Label AND c.IsDeleted = 0);

    -- ── Default lifecycle ────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM dbo.Lifecycle WHERE LifecycleId = @Lc)
        INSERT INTO dbo.Lifecycle (LifecycleId, WorkspaceId, Name, RequestType, IsDefault, SortOrder, CreatedBy, UpdatedBy)
        VALUES (@Lc, @Ws, N'Standard AI build', N'Full build', 1, 0, @Seed, @Seed);

    -- ── Stages (six canonical keys, each with a status category) ──────────────
    ;WITH Stages(StageDefinitionId, StageKey, Label, StatusCategory, SortOrder) AS (
        SELECT @SIntake,    N'intake',      N'Intake',      N'Intake', 0 UNION ALL
        SELECT @SDiscovery, N'discovery',   N'Discovery',   N'Build',  1 UNION ALL
        SELECT @SBuild,     N'build',       N'Build',       N'Build',  2 UNION ALL
        SELECT @SQa,        N'qa',          N'QA',          N'Review', 3 UNION ALL
        SELECT @SDeploy,    N'deploy',      N'Deploy',      N'Deploy', 4 UNION ALL
        SELECT @SPost,      N'post-launch', N'Post-launch', N'Deploy', 5
    )
    INSERT INTO dbo.StageDefinition (StageDefinitionId, LifecycleId, WorkspaceId, StageKey, Label, StatusCategory, SortOrder, CreatedBy, UpdatedBy)
    SELECT s.StageDefinitionId, @Lc, @Ws, s.StageKey, s.Label, s.StatusCategory, s.SortOrder, @Seed, @Seed
    FROM Stages AS s
    WHERE NOT EXISTS (SELECT 1 FROM dbo.StageDefinition AS d WHERE d.StageDefinitionId = s.StageDefinitionId);

    -- ── Gates ────────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM dbo.GateDefinition WHERE GateDefinitionId = @GQa)
        INSERT INTO dbo.GateDefinition (GateDefinitionId, LifecycleId, WorkspaceId, Name, FromStageId, ToStageId, JoinKind, SortOrder, CreatedBy, UpdatedBy)
        VALUES (@GQa, @Lc, @Ws, N'QA readiness gate', @SBuild, @SQa, N'and', 0, @Seed, @Seed);

    IF NOT EXISTS (SELECT 1 FROM dbo.GateDefinition WHERE GateDefinitionId = @GPost)
        INSERT INTO dbo.GateDefinition (GateDefinitionId, LifecycleId, WorkspaceId, Name, FromStageId, ToStageId, JoinKind, SortOrder, CreatedBy, UpdatedBy)
        VALUES (@GPost, @Lc, @Ws, N'Post-launch readiness gate', @SDeploy, @SPost, N'and', 1, @Seed, @Seed);

    -- ── Approver slots (team-only) ───────────────────────────────────────────
    ;WITH Slots(GateDefinitionId, RoleLabel, SlotIndex) AS (
        SELECT @GQa,   N'InfoSec',              0 UNION ALL
        SELECT @GQa,   N'AI Solutions Manager', 1 UNION ALL
        SELECT @GQa,   N'PG/Dept Lead',         2 UNION ALL
        SELECT @GPost, N'AI Solutions Manager', 0 UNION ALL
        SELECT @GPost, N'GCO',                  1
    )
    INSERT INTO dbo.GateApproverSlot (GateDefinitionId, RoleLabel, SlotIndex, CreatedBy, UpdatedBy)
    SELECT sl.GateDefinitionId, sl.RoleLabel, sl.SlotIndex, @Seed, @Seed
    FROM Slots AS sl
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.GateApproverSlot AS existing
        WHERE existing.GateDefinitionId = sl.GateDefinitionId AND existing.RoleLabel = sl.RoleLabel AND existing.IsDeleted = 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_028_SeedAiSolutionsLifecycle')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260703_028_SeedAiSolutionsLifecycle', SUSER_SNAME(), N'Slice 4 — seed role-labels + default AI Solutions lifecycle, stages, gates, slots.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
