-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: DATA migration. Seeds the three task-bundle templates on the AI Solutions
--              workspace (blueprint: Extraction / review build, Drafting assistant,
--              Meeting-driven engagement). Each template's TasksJson holds { title, phase }
--              entries taken from the prototype TASK_TEMPLATES. The prototype's per-task field
--              hints and signoff markers are intentionally NOT carried — applying a bundle
--              creates plain Open tasks (gates are the slice-8 model, not task-level signoff).
--              Seeded on AI Solutions (the build hub); idempotent (unique key per workspace).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Ws   UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001'; -- AI Solutions
DECLARE @Seed NVARCHAR(256)    = N'system-seed';

DECLARE @Templates TABLE (TemplateKey NVARCHAR(64), Name NVARCHAR(200), TasksJson NVARCHAR(MAX), SortOrder INT);

INSERT INTO @Templates (TemplateKey, Name, TasksJson, SortOrder)
VALUES
    (N'extraction-review-build', N'Extraction / review build',
     N'[
        {"title":"Confirm scope with the requestor","phase":"Discovery"},
        {"title":"Map source documents & access path","phase":"Discovery"},
        {"title":"Annotate taxonomy / labels","phase":"Discovery"},
        {"title":"Create GitHub repo","phase":"Build"},
        {"title":"Build extraction pipeline","phase":"Build"},
        {"title":"Wire output into destination system","phase":"Build"},
        {"title":"Draft QA test set","phase":"QA"},
        {"title":"Sign off: accuracy meets target","phase":"QA"},
        {"title":"Schedule stakeholder acceptance review","phase":"Deploy"}
      ]', 1),
    (N'drafting-assistant', N'Drafting assistant',
     N'[
        {"title":"Gather sample documents & house style","phase":"Discovery"},
        {"title":"Define prompt + guardrails","phase":"Build"},
        {"title":"Build drafting flow","phase":"Build"},
        {"title":"Reviewer QA on 20 drafts","phase":"QA"},
        {"title":"Sign off: reviewer acceptance","phase":"QA"},
        {"title":"Rollout & monitoring plan","phase":"Deploy"}
      ]', 2),
    (N'meeting-driven-engagement', N'Meeting-driven engagement',
     N'[
        {"title":"Meet with stakeholders","phase":"Discovery"},
        {"title":"Document requirements & decisions","phase":"Discovery"},
        {"title":"Circulate scope for sign-off","phase":"Discovery"},
        {"title":"Build to agreed scope","phase":"Build"},
        {"title":"Acceptance review with stakeholders","phase":"QA"}
      ]', 3);

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.TaskBundleTemplate
        (WorkspaceId, TemplateKey, Name, TasksJson, SortOrder, CreatedBy, UpdatedBy)
    SELECT @Ws, t.TemplateKey, t.Name, t.TasksJson, t.SortOrder, @Seed, @Seed
    FROM @Templates t
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.TaskBundleTemplate b
        WHERE b.WorkspaceId = @Ws AND b.TemplateKey = t.TemplateKey AND b.IsDeleted = 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_035_SeedTaskBundleTemplates')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260704_035_SeedTaskBundleTemplates', SUSER_SNAME(), N'Slice 7 — seed 3 task-bundle templates on AI Solutions.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
