-- =============================================
-- Author:      Announcements platform broadcast (workspace scoping + platform fan-out)
-- Create Date: 2026-07-24
-- Description: Adds a nullable BroadcastId to dbo.Announcements. A platform-admin broadcast fans out one
--              normal per-workspace announcement row per targeted workspace; every copy from a single
--              post shares one BroadcastId so the platform surface groups and manages them as one
--              broadcast. Workspace-authored announcements leave BroadcastId NULL. A filtered index
--              (BroadcastId IS NOT NULL) supports the grouped platform read (usp_QueryPlatformAnnouncements).
--              Idempotent per database-migrations.md; the paired rollback drops the index then the column.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- ── Column ───────────────────────────────────────────────────────────────────
IF COL_LENGTH(N'dbo.Announcements', N'BroadcastId') IS NULL
    ALTER TABLE dbo.Announcements ADD BroadcastId UNIQUEIDENTIFIER NULL;
GO

-- ── Filtered index — drives the grouped platform read (broadcasts only) ──────
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Announcements_BroadcastId'
      AND object_id = OBJECT_ID(N'dbo.Announcements'))
    CREATE NONCLUSTERED INDEX IX_Announcements_BroadcastId
        ON dbo.Announcements (BroadcastId)
        WHERE BroadcastId IS NOT NULL;
GO
