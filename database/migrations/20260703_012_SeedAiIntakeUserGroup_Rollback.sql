-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_012_SeedAiIntakeUserGroup. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DELETE FROM dbo.UserGroupMembership
WHERE UserGroupId = N'1A1EA150-0000-4000-8000-000000000001';

DELETE FROM dbo.UserGroup
WHERE UserGroupId = N'1A1EA150-0000-4000-8000-000000000001';
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_012_SeedAiIntakeUserGroup';
GO
