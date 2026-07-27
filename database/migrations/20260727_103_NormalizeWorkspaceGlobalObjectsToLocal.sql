-- =============================================
-- Author:      restrict-global-object-authoring (root-cause security fix)
-- Create Date: 2026-07-27
-- Description: DATA migration (no schema change). Normalizes existing mislabelled objects: any
--              dbo.ObjectDefinition row that has a real WorkspaceId but is labelled
--              Location='Global' is flipped to Location='LocalWorkspace'. "Global" is meant to mean
--              platform-owned (WorkspaceId IS NULL) — a workspace-owned row labelled Global is a
--              defect, not a valid state (the API and web editor no longer allow a workspace to
--              author Location='Global'; see ObjectsController.WorkspaceCreatableLocations and
--              ObjectEditorSheet). This migration corrects any such rows that were created before
--              that fix shipped.
--
--              Runs against ALL rows regardless of soft-delete state (no IsDeleted filter) — a
--              mislabelled row shouldn't stay Global-labelled even if it was later deleted.
--
--              Idempotent by construction: once a row is flipped to LocalWorkspace it no longer
--              matches the WHERE clause, so re-running this migration is a no-op (UPDATE affects
--              zero rows on subsequent runs). The MigrationHistory guard below additionally
--              prevents ever re-running it against a DB where it has already recorded as applied.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.ObjectDefinition
SET    Location = N'LocalWorkspace',
       UpdatedAt = SYSUTCDATETIME(),
       UpdatedBy = N'system:migration-103-normalize-workspace-global-objects'
WHERE  WorkspaceId IS NOT NULL AND Location = N'Global';
PRINT CONCAT(N'Normalized ', @@ROWCOUNT, N' workspace-owned Global-labelled object(s) to LocalWorkspace.');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260727_103_NormalizeWorkspaceGlobalObjectsToLocal')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260727_103_NormalizeWorkspaceGlobalObjectsToLocal', SUSER_SNAME(), N'restrict-global-object-authoring — normalized workspace-owned Location=''Global'' object rows to LocalWorkspace (root-cause data fix; the write path no longer allows this state).');
GO
