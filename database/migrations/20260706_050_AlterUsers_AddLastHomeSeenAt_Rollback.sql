-- =============================================
-- Author:      /dev-build-application (Slice 22 — Home surface)
-- Create Date: 2026-07-06
-- Description: Rollback for 20260706_050 — drops Users.LastHomeSeenAt. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Users', N'LastHomeSeenAt') IS NOT NULL
    ALTER TABLE dbo.Users DROP COLUMN LastHomeSeenAt;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_050_AlterUsers_AddLastHomeSeenAt';
GO
