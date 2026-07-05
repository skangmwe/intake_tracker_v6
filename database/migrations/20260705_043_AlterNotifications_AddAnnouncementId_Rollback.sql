-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_043_AlterNotifications_AddAnnouncementId. Drops the FK then the
--              column, and removes the migration-history row. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Notifications_Announcements')
    ALTER TABLE dbo.Notifications DROP CONSTRAINT FK_Notifications_Announcements;
GO

IF COL_LENGTH(N'dbo.Notifications', N'AnnouncementId') IS NOT NULL
    ALTER TABLE dbo.Notifications DROP COLUMN AnnouncementId;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_043_AlterNotifications_AddAnnouncementId')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_043_AlterNotifications_AddAnnouncementId';
GO
