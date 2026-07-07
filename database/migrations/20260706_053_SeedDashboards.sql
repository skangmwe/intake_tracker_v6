-- =============================================
-- Author:      /dev-build-application (Slice 23 — Seeded Dashboards)
-- Create Date: 2026-07-06
-- Description: DATA migration (separate from schema per database-migrations.md). Seeds the four
--              starter dashboards (BS §10.5-10.6): three on the AI Solutions workspace
--              (ai-default S6, ai-workload S14, feature-catalog S12) and one on the PG/Dept
--              template (pg-starter S15) that usp_ProvisionWorkspace clones into every new PG
--              workspace. Each carries its widget list verbatim; records-grid widgets ship with
--              no savedViewId (the starter defines none). Idempotent — guarded by the fixed
--              SavedDashboardId GUIDs so re-running does not duplicate.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @AiWorkspaceId UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001';
DECLARE @TemplateId    UNIQUEIDENTIFIER = N'9C700000-0000-4000-8000-000000000001';
DECLARE @Seed          NVARCHAR(256)    = N'system-seed';
DECLARE @Everyone      NVARCHAR(MAX)    = N'{"kind":"everyone"}';

DECLARE @AiDefaultId   UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000001';
DECLARE @AiWorkloadId  UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000002';
DECLARE @FeatureCatId  UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000003';
DECLARE @PgStarterId   UNIQUEIDENTIFIER = N'DA5B0000-0000-4000-8000-000000000004';

BEGIN TRY
    BEGIN TRANSACTION;

    -- ── ai-default (S6) — AI workspace default landing dashboard ─────────────────
    IF NOT EXISTS (SELECT 1 FROM dbo.SavedDashboard WHERE SavedDashboardId = @AiDefaultId)
        INSERT INTO dbo.SavedDashboard
            (SavedDashboardId, WorkspaceId, Slug, Name, Description, ObjectType, AudienceJson,
             IsDefault, SupportsDrillThrough, WidgetsJson, CreatedBy, UpdatedBy)
        VALUES
            (@AiDefaultId, @AiWorkspaceId, N'ai-default', N'AI Solutions dashboard',
             N'Default landing dashboard for the AI Solutions workspace — in-flight pipeline, escalations, and open work.',
             N'Request', @Everyone, 1, 1,
             N'[{"id":"inflight","type":"segmented-bar","title":"Inflight status","config":{"metric":"pipeline-by-category"}},{"id":"escal","type":"kpi-with-trend","title":"Escalations this quarter","config":{"metric":"escalations-by-quarter-origin"}},{"id":"unassd","type":"kpi-tile","title":"Unassigned past Intake","config":{"metric":"unassigned-past-intake"}},{"id":"closures","type":"bar-breakdown","title":"Closures this quarter","config":{"metric":"closures-by-outcome"}},{"id":"heatmap","type":"heatmap-matrix","title":"Requests by Dept/PG/Client × status","config":{"metric":"origin-by-status-heatmap"}},{"id":"grid","type":"records-grid","title":"All open requests","config":{"metric":"records-grid","objectType":"Request"}}]',
             @Seed, @Seed);

    -- ── ai-workload (S14) — analyst workload ─────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM dbo.SavedDashboard WHERE SavedDashboardId = @AiWorkloadId)
        INSERT INTO dbo.SavedDashboard
            (SavedDashboardId, WorkspaceId, Slug, Name, Description, ObjectType, AudienceJson,
             IsDefault, SupportsDrillThrough, WidgetsJson, CreatedBy, UpdatedBy)
        VALUES
            (@AiWorkloadId, @AiWorkspaceId, N'ai-workload', N'Analyst workload',
             N'Open records per analyst, unassigned and pending sign-off, triage speed, and aging in stage.',
             N'Request', @Everyone, 0, 1,
             N'[{"id":"peranalyst","type":"bar-breakdown","title":"Open records per analyst","config":{"metric":"open-per-analyst"}},{"id":"unassd","type":"kpi-tile","title":"Unassigned","config":{"metric":"unassigned-past-intake"}},{"id":"pending","type":"kpi-tile","title":"Pending sign-off","config":{"metric":"pending-signoff"}},{"id":"triage","type":"kpi-with-trend","title":"Median time-to-first-triage","config":{"metric":"median-time-to-triage"}},{"id":"aging","type":"histogram","title":"Aging in stage","config":{"metric":"aging-in-stage"}},{"id":"grid","type":"records-grid","title":"Records","config":{"metric":"records-grid","objectType":"Request"}}]',
             @Seed, @Seed);

    -- ── feature-catalog (S12) — published features ───────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM dbo.SavedDashboard WHERE SavedDashboardId = @FeatureCatId)
        INSERT INTO dbo.SavedDashboard
            (SavedDashboardId, WorkspaceId, Slug, Name, Description, ObjectType, AudienceJson,
             IsDefault, SupportsDrillThrough, WidgetsJson, CreatedBy, UpdatedBy)
        VALUES
            (@FeatureCatId, @AiWorkspaceId, N'feature-catalog', N'Feature catalog',
             N'Published reusable features grouped by type and by tech / stack.',
             N'Feature', @Everyone, 0, 1,
             N'[{"id":"published","type":"kpi-tile","title":"Published features","config":{"metric":"features-published"}},{"id":"bytype","type":"bar-breakdown","title":"Features by type","config":{"metric":"features-by-type"}},{"id":"bytech","type":"bar-breakdown","title":"Features by tech / stack","config":{"metric":"features-by-tech"}},{"id":"grid","type":"records-grid","title":"Catalog","config":{"metric":"records-grid","objectType":"Feature"}}]',
             @Seed, @Seed);

    -- ── pg-starter (S15) — cloned into every provisioned PG workspace ────────────
    IF NOT EXISTS (SELECT 1 FROM dbo.SavedDashboard WHERE SavedDashboardId = @PgStarterId)
        INSERT INTO dbo.SavedDashboard
            (SavedDashboardId, WorkspaceId, Slug, Name, Description, ObjectType, AudienceJson,
             IsDefault, SupportsDrillThrough, WidgetsJson, CreatedBy, UpdatedBy)
        VALUES
            (@PgStarterId, @TemplateId, N'pg-starter', N'Practice group starter',
             N'Starter dashboard cloned into each provisioned PG / Dept workspace.',
             N'Request', @Everyone, 1, 1,
             N'[{"id":"byorigin","type":"bar-breakdown","title":"Requests by Dept/PG/Client","config":{"metric":"requests-by-origin"}},{"id":"escstat","type":"kpi-tile","title":"Escalation status","config":{"metric":"escalation-status"}},{"id":"grid","type":"records-grid","title":"Records","config":{"metric":"records-grid","objectType":"Request"}}]',
             @Seed, @Seed);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_053_SeedDashboards')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260706_053_SeedDashboards', SUSER_SNAME(), N'Slice 23 — seed the four starter dashboards.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
