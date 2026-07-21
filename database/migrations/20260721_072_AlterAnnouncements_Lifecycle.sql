-- =============================================
-- Author:      Announcements reconciliation (Depth C — full lifecycle + scheduler)
-- Create Date: 2026-07-21
-- Description: Extends dbo.Announcements for the reconciled lifecycle (Scheduled / Active(=Published) /
--              Archived) with auto-archive. Adds:
--                • ScheduledPublishAt — when set on a Scheduled row, the tick publishes it at this time.
--                • AutoArchive        — when 1, a Published row auto-archives 30 days after publish.
--                • AutoArchiveAt      — server-computed publish + 30d; the tick archives at this time.
--              Widens CK_Announcements_Status to keep legacy Draft/Retired valid for existing rows while
--              allowing the new Scheduled / Archived states (new writes use only Scheduled / Published /
--              Archived; legacy Draft/Retired are display-mapped to Archived at read time). Adds one
--              filtered index driving the ~60s tick sweep (usp_TickAnnouncements). Idempotent per
--              database-migrations.md; paired rollback drops the columns/index and restores the CHECK.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- ── Columns ──────────────────────────────────────────────────────────────────
IF COL_LENGTH(N'dbo.Announcements', N'ScheduledPublishAt') IS NULL
    ALTER TABLE dbo.Announcements ADD ScheduledPublishAt DATETIME2 NULL;
GO

IF COL_LENGTH(N'dbo.Announcements', N'AutoArchive') IS NULL
    ALTER TABLE dbo.Announcements
        ADD AutoArchive BIT NOT NULL CONSTRAINT DF_Announcements_AutoArchive DEFAULT 1;
GO

IF COL_LENGTH(N'dbo.Announcements', N'AutoArchiveAt') IS NULL
    ALTER TABLE dbo.Announcements ADD AutoArchiveAt DATETIME2 NULL;
GO

-- ── Status CHECK — widen to include Scheduled + Archived ─────────────────────
-- Drop-then-add so the migration converges to the widened set on every run (idempotent). Existing
-- rows are all Draft/Published/Retired, which remain members of the widened set, so the ADD validates.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_Announcements_Status' AND parent_object_id = OBJECT_ID(N'dbo.Announcements'))
    ALTER TABLE dbo.Announcements DROP CONSTRAINT CK_Announcements_Status;
GO

ALTER TABLE dbo.Announcements
    ADD CONSTRAINT CK_Announcements_Status
        CHECK (Status IN (N'Draft', N'Scheduled', N'Published', N'Retired', N'Archived'));
GO

-- ── Tick-sweep index ─────────────────────────────────────────────────────────
-- usp_TickAnnouncements scans by Status for due rows: Scheduled rows whose ScheduledPublishAt has
-- passed, and Published rows whose AutoArchiveAt has passed. Status-leading filtered index keeps both
-- sweeps seekable; the schedule/archive/auto-archive timestamps + fan-out keys are INCLUDEd so the
-- flip read stays covering (database-performance.md — one index, justified by the tick query pattern).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Announcements_Status_Tick' AND object_id = OBJECT_ID(N'dbo.Announcements'))
    CREATE NONCLUSTERED INDEX IX_Announcements_Status_Tick
        ON dbo.Announcements (Status, ScheduledPublishAt, AutoArchiveAt)
        INCLUDE (AutoArchive, PublishedAt, WorkspaceId, AuthorUserId)
        WHERE IsDeleted = 0;
GO

-- ── Migration history ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260721_072_AlterAnnouncements_Lifecycle')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260721_072_AlterAnnouncements_Lifecycle', SUSER_SNAME(),
            N'Announcements reconciliation — Scheduled/Archived lifecycle + auto-archive columns, widened Status CHECK, tick-sweep index.');
END;
GO
