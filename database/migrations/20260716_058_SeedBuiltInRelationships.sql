-- =============================================
-- Author:      /dev-build-application (Slice 25 — config-driven tab bar)
-- Create Date: 2026-07-16
-- Description: DATA migration. Seeds one built-in Relationship per existing workspace
--              so the config-driven tab bar (S4/S5) renders the Tasks & gates tab as a
--              relationship-driven tab via useRelationshipTabs.
--
--              Attachments stays as a base always-on tab in the web (not a Relationships
--              row) — Attachment is not a first-class relatable object in R1 (no
--              FieldDefinition schema, not in ToObjectType CHECK); making it a relationship
--              would force awkward auto-provisioning skips. The web's base tab list
--              includes Attachments alongside Status / Intake / Activity / Watchers.
--              (Decision recorded in the slice doc.)
--
--              IsSystem = 1 → skips Link-to-record FieldDefinition auto-provisioning at
--              upsert (Task already carries RequestId FK) and blocks retire/edit from the
--              admin surface. usp_ProvisionWorkspace (Slice 19/24) will be extended in a
--              follow-up to seed this Relationship for newly-provisioned workspaces; for
--              R1 the two existing workspaces (AI Solutions + PG template) plus any admin-
--              provisioned PGs get one row apiece from this migration.
--
--              Idempotent (guarded by (workspace, from, to, name)).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Seed NVARCHAR(256) = N'system-seed';

BEGIN TRY
    BEGIN TRANSACTION;

    -- Seed one Request→Task Relationship per active workspace.
    INSERT INTO dbo.Relationships
        (WorkspaceId, Name, FromObjectType, ToObjectType, Cardinality,
         FromSideLabel, ToSideLabel, ShowOnFromAsTab, TabLabel, SortOrder,
         IsSystem, CreatedBy, UpdatedBy)
    SELECT w.WorkspaceId,
           N'Request has Tasks',
           N'Request',
           N'Task',
           N'OneToMany',
           N'Tasks',
           N'Request',
           1,
           N'Tasks & gates',
           10,   -- appears first among relationship-driven tabs
           1,    -- IsSystem
           @Seed,
           @Seed
    FROM   dbo.Workspaces w
    WHERE  w.IsDeleted = 0
      AND  NOT EXISTS (
               SELECT 1
                 FROM dbo.Relationships r
                WHERE r.WorkspaceId    = w.WorkspaceId
                  AND r.FromObjectType = N'Request'
                  AND r.ToObjectType   = N'Task'
                  AND r.Name           = N'Request has Tasks'
                  AND r.IsDeleted      = 0
           );

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_058_SeedBuiltInRelationships')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260716_058_SeedBuiltInRelationships', SUSER_SNAME(),
                N'Slice 25 — seed built-in Request→Task Relationship per workspace (config-driven tab bar).');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
