-- =============================================
-- Author:      Announcements reconciliation (Depth C — full lifecycle + scheduler)
-- Create Date: 2026-07-21
-- Description: The scheduler sweep for the reconciled announcement lifecycle. Called on a ~60s timer by
--              the Worker (AnnouncementSchedulerService, slice 2). Set-based and idempotent:
--                1. Archives due Published rows — AutoArchive = 1 AND AutoArchiveAt <= now → Archived.
--                2. Publishes due Scheduled rows — ScheduledPublishAt <= now → Published, stamping
--                   PublishedAt = ScheduledPublishAt and AutoArchiveAt = PublishedAt + 30d (when
--                   AutoArchive = 1). The newly-published rows are RETURNED (single result set) so the
--                   Worker can emit exactly one announcement.published event per row through the same
--                   IEventSpine path manual publish uses — audit + bell fan-out stay single-sourced in
--                   the API, never duplicated in SQL.
--              Archiving runs before publishing so a row published this tick (AutoArchiveAt = +30d) is
--              never archived in the same sweep. Only dbo.Announcements is touched (consistent access
--              order — deadlock rule). Re-running with nothing due is a no-op returning zero rows.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_TickAnnouncements
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Now DATETIME2     = SYSUTCDATETIME();
    DECLARE @By  NVARCHAR(256) = N'system';

    DECLARE @Published TABLE
    (
        AnnouncementId UNIQUEIDENTIFIER NOT NULL,
        WorkspaceId    UNIQUEIDENTIFIER NOT NULL,
        AuthorUserId   UNIQUEIDENTIFIER NOT NULL
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Archive due Published rows (no fan-out on archive).
        UPDATE dbo.Announcements
        SET Status    = N'Archived',
            UpdatedAt = @Now,
            UpdatedBy = @By
        WHERE Status = N'Published'
          AND AutoArchive = 1
          AND AutoArchiveAt IS NOT NULL
          AND AutoArchiveAt <= @Now
          AND IsDeleted = 0;

        -- 2. Publish due Scheduled rows; capture them for the caller to fan out.
        UPDATE dbo.Announcements
        SET Status       = N'Published',
            PublishedAt   = ScheduledPublishAt,
            AutoArchiveAt = CASE WHEN AutoArchive = 1 THEN DATEADD(DAY, 30, ScheduledPublishAt) ELSE NULL END,
            UpdatedAt     = @Now,
            UpdatedBy     = @By
        OUTPUT inserted.AnnouncementId, inserted.WorkspaceId, inserted.AuthorUserId INTO @Published
        WHERE Status = N'Scheduled'
          AND ScheduledPublishAt IS NOT NULL
          AND ScheduledPublishAt <= @Now
          AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    -- Single result set: the rows the Worker must fan out (empty when nothing was published).
    SELECT AnnouncementId, WorkspaceId, AuthorUserId
    FROM @Published;
END;
GO
