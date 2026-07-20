-- =============================================
-- Author:      slice/invited-membership-state (Invited membership state — S29)
-- Create Date: 2026-07-20
-- Description: Rollback for 20260720_066_CreateWorkspaceInvitation. Drops the WorkspaceInvitation table
--              (indexes fall with it) and removes the migration-history row. Idempotent per
--              database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.WorkspaceInvitation', N'U') IS NOT NULL
    DROP TABLE dbo.WorkspaceInvitation;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_066_CreateWorkspaceInvitation')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260720_066_CreateWorkspaceInvitation';
GO
