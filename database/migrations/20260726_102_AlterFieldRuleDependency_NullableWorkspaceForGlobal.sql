-- =============================================
-- Author:      global-custom-objects (SP3b slice 2a — Task 2 fix pass)
-- Create Date: 2026-07-26
-- Description: Makes dbo.FieldRuleDependency.WorkspaceId nullable so a Global (platform-owned)
--              field's rule-dependency edges can be stored with WorkspaceId=NULL — the same
--              namespace as the FieldDefinition row they belong to (WorkspaceId=NULL,
--              Location='Global'). Without this, usp_UpsertFieldDefinition's INSERT INTO
--              dbo.FieldRuleDependency fails on the (until now) NOT NULL column whenever a
--              Global field carries a non-empty @DependenciesJson (a conditional rule).
--
--              Unlike migration 101 (dbo.FieldDefinition), FieldRuleDependency has no per-workspace
--              UNIQUE index to re-scope — its two indexes (IX_FieldRuleDependency_WorkspaceId,
--              IX_FieldRuleDependency_Workspace_Object) are both plain non-unique lookup indexes,
--              so there is nothing to re-scope for Global rows either way. The NOT NULL -> NULL
--              widening below is a metadata-only operation SQL Server allows even with indexes
--              present (same as migration 101's forward direction) — no drop/recreate is required
--              here; the rollback still has to drop and recreate both indexes, because narrowing
--              NULL -> NOT NULL is the direction SQL Server blocks while an index references the
--              column. The FK to dbo.Workspaces is left in place: a NULL FK value is simply never
--              checked by the constraint, so no FK changes are needed either. Idempotent.
-- =============================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.FieldRuleDependency')
           AND name = N'WorkspaceId' AND is_nullable = 0)
    ALTER TABLE dbo.FieldRuleDependency ALTER COLUMN WorkspaceId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260726_102_AlterFieldRuleDependency_NullableWorkspaceForGlobal')
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260726_102_AlterFieldRuleDependency_NullableWorkspaceForGlobal', SUSER_SNAME(), N'SP3b slice 2a (Task 2 fix pass) — nullable WorkspaceId so a Global field''s rule-dependency edges can store with WorkspaceId NULL.');
GO
