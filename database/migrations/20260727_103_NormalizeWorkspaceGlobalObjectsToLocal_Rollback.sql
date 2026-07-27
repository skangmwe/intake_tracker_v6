-- =============================================
-- Author:      restrict-global-object-authoring (root-cause security fix)
-- Create Date: 2026-07-27
-- Description: Rollback for 20260727_103_NormalizeWorkspaceGlobalObjectsToLocal.
--
--              The data change is INTENTIONALLY NOT REVERSED. Location='Global' on a
--              workspace-owned row was itself the defect this migration corrects — there is no
--              correct prior state to restore to, and the read procs (usp_ListObjectDefinitions,
--              usp_GetObjectDefinitionById, usp_ListGlobalObjectDefinitions) already treated those
--              rows as local/excluded-from-Global before this migration ran, so nothing downstream
--              depended on the mislabelled state. Re-flipping rows back to Location='Global' would
--              simply reintroduce the defect.
--
--              This rollback only removes the MigrationHistory row, which lets a re-apply of the
--              forward migration run again — idempotent, and a no-op once the data is already
--              normalized (no row currently matches WorkspaceId IS NOT NULL AND Location='Global').
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260727_103_NormalizeWorkspaceGlobalObjectsToLocal')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260727_103_NormalizeWorkspaceGlobalObjectsToLocal';
GO
