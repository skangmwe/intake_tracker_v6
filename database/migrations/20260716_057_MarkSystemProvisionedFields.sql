-- =============================================
-- Author:      /dev-build-application (Slice 25)
-- Create Date: 2026-07-16
-- Description: DATA migration. Marks per-workspace FieldDefinition rows as system-
--              provisioned (v2-reconciliation.md §Model deltas 2).
--
--              The v2 addendum lists five "system fields" for the S30 Fields tab locked
--              band: Record ID / Name / Date created / Last updated / Created by. Four of
--              these five (Record ID, Date created, Last updated, plus AI Solutions
--              Status) are already central platform-defined entries on dbo.PlatformField
--              seeded by 20260703_011_SeedPlatformFields — they render via the existing
--              "Platform-defined band" pattern (Slice 3). This migration marks the one
--              per-workspace-object entry that is not platform-scoped — 'name' — as
--              IsSystemProvisioned = 1 on every workspace × object where it exists. The
--              S30 web surface composes the locked "System-provisioned" band from the
--              PlatformField rows (existing) UNION this newly-flagged FieldDefinition
--              subset.
--
--              Idempotent — only updates rows where the flag is not already set.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.FieldDefinition
       SET IsSystemProvisioned = 1,
           IsReadOnly          = 1,
           UpdatedAt           = SYSUTCDATETIME(),
           UpdatedBy           = N'system-seed'
     WHERE FieldKey            = N'name'
       AND ObjectType         IN (N'Request', N'Task', N'Feature')
       AND IsDeleted           = 0
       AND IsSystemProvisioned = 0;

    IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_057_MarkSystemProvisionedFields')
        INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
        VALUES (N'20260716_057_MarkSystemProvisionedFields', SUSER_SNAME(),
                N'Slice 25 — mark FieldDefinition.name as IsSystemProvisioned=1 per workspace × object.');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
