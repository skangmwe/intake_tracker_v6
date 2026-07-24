-- =============================================
-- Author:      Announcements platform broadcast (workspace scoping + platform fan-out)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_077_AlterAnnouncements_AddBroadcastId. Drops the filtered index then
--              the BroadcastId column. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Announcements_BroadcastId'
      AND object_id = OBJECT_ID(N'dbo.Announcements'))
    DROP INDEX IX_Announcements_BroadcastId ON dbo.Announcements;
GO

IF COL_LENGTH(N'dbo.Announcements', N'BroadcastId') IS NOT NULL
    ALTER TABLE dbo.Announcements DROP COLUMN BroadcastId;
GO
