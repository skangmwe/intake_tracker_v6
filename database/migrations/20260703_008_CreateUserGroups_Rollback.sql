-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_008_CreateUserGroups. Idempotent.
--              Drops the child table first to satisfy the FK.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.UserGroupMembership', N'U') IS NOT NULL
    DROP TABLE dbo.UserGroupMembership;
GO

IF OBJECT_ID(N'dbo.UserGroup', N'U') IS NOT NULL
    DROP TABLE dbo.UserGroup;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_008_CreateUserGroups';
GO
