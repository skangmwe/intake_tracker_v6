-- =============================================
-- Author:      Announcements reconciliation (Depth C — full lifecycle + scheduler)
-- Create Date: 2026-07-21
-- Description: Rollback for 20260721_072_AlterAnnouncements_Lifecycle. Drops the tick-sweep index and the
--              three lifecycle columns, and restores the original Draft/Published/Retired Status CHECK.
--              Idempotent (guards on every object). NOTE: restoring the narrower CHECK requires that no
--              row is currently in Scheduled/Archived — the caller must reconcile any such rows to
--              Published/Retired before running this rollback (a CHECK add validates existing data).
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Announcements_Status_Tick' AND object_id = OBJECT_ID(N'dbo.Announcements'))
    DROP INDEX IX_Announcements_Status_Tick ON dbo.Announcements;
GO

-- Restore the original CHECK (Draft/Published/Retired). Drop the widened one first.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Announcements_Status' AND parent_object_id = OBJECT_ID(N'dbo.Announcements'))
    ALTER TABLE dbo.Announcements DROP CONSTRAINT CK_Announcements_Status;
GO

ALTER TABLE dbo.Announcements
    ADD CONSTRAINT CK_Announcements_Status CHECK (Status IN (N'Draft', N'Published', N'Retired'));
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = N'DF_Announcements_AutoArchive' AND parent_object_id = OBJECT_ID(N'dbo.Announcements'))
    ALTER TABLE dbo.Announcements DROP CONSTRAINT DF_Announcements_AutoArchive;
GO

IF COL_LENGTH(N'dbo.Announcements', N'AutoArchive') IS NOT NULL
    ALTER TABLE dbo.Announcements DROP COLUMN AutoArchive;
GO

IF COL_LENGTH(N'dbo.Announcements', N'ScheduledPublishAt') IS NOT NULL
    ALTER TABLE dbo.Announcements DROP COLUMN ScheduledPublishAt;
GO

IF COL_LENGTH(N'dbo.Announcements', N'AutoArchiveAt') IS NOT NULL
    ALTER TABLE dbo.Announcements DROP COLUMN AutoArchiveAt;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_072_AlterAnnouncements_Lifecycle';
GO
