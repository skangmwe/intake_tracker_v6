-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Adds dbo.Notifications.AnnouncementId — the deep-link target for an
--              'announcement-posted' bell row (BS §2.7, module-boundaries §9/§16). RecordId
--              (NVARCHAR(20)) holds the PREFIX-NNNNNNNN record key and cannot carry an announcement
--              GUID, so a nullable AnnouncementId is added: NULL for record events, set for
--              announcement postings so the bell can open S21. The slice-12 dedup UNIQUE index
--              (UserId, RecordId, Category, SourceEventId) is unaffected — SourceEventId already
--              differentiates each announcement.published event. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Notifications', N'AnnouncementId') IS NULL
    ALTER TABLE dbo.Notifications ADD AnnouncementId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Notifications_Announcements')
   AND OBJECT_ID(N'dbo.Announcements', N'U') IS NOT NULL
    ALTER TABLE dbo.Notifications WITH CHECK
        ADD CONSTRAINT FK_Notifications_Announcements FOREIGN KEY (AnnouncementId)
            REFERENCES dbo.Announcements (AnnouncementId) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_043_AlterNotifications_AddAnnouncementId')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_043_AlterNotifications_AddAnnouncementId', SUSER_SNAME(), N'Slice 13 — Notifications.AnnouncementId (bell deep-link to an announcement).');
END;
GO
