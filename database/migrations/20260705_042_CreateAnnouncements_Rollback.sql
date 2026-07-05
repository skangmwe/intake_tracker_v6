-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Rollback for 20260705_042_CreateAnnouncements. Drops the table (indexes fall with it)
--              and removes the migration-history row. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Announcements', N'U') IS NOT NULL
    DROP TABLE dbo.Announcements;
GO

IF EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_042_CreateAnnouncements')
    DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_042_CreateAnnouncements';
GO
