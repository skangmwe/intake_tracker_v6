-- =============================================
-- Author:      /dev-build-application (Slice 12 — Watchers; Slice 26 — per-record preferences)
-- Create Date: 2026-07-05
-- Last update: 2026-07-17 (Slice 26 — project 5 preference booleans on caller's own row)
-- Description: Lists the live watchers of a record on one side, with each watcher's DisplayName so
--              the Watchers card renders avatars without a directory fetch (mirrors slice 8's frozen
--              approver names). Access is gated on @UserId's membership of the record's workspace —
--              a caller who cannot see the record gets ZERO rows (the service resolves the record
--              first via usp_GetRequestByIdForUser, so a forbidden record is a 403 not an empty 200).
--              Newest subscription first. The service derives `isWatching` by matching @UserId.
--
--              Slice 26: the caller's own row projects the five WatcherNotificationPreference
--              booleans (from dbo.WatcherNotificationPreference, LEFT JOIN — a missing pref row
--              means defaults-all-true per D4). Other watchers' rows carry NULL for the five
--              columns — a watcher never sees another watcher's preferences (privacy floor,
--              §PII handling). The API layer surfaces the caller's five booleans on the
--              WatcherListItemDto and omits the fields on other rows.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetWatchers
    @RecordId    NVARCHAR(20),
    @WorkspaceId UNIQUEIDENTIFIER,
    @UserId      UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Record NVARCHAR(20)     = @RecordId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @User   UNIQUEIDENTIFIER = @UserId;

    -- Access gate: caller must be a member of the record's workspace.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Requests AS r
        INNER JOIN dbo.WorkspaceMembership AS m
            ON m.WorkspaceId = r.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0
        WHERE r.RecordId = @Record AND r.WorkspaceId = @Ws AND r.IsDeleted = 0)
        RETURN;

    -- Preference projection: the CASE WHEN w.UserId = @User guard scopes the five booleans
    -- to the caller's own row so no other watcher's preferences leak. ISNULL wraps the LEFT
    -- JOIN default (missing row → all five booleans default to 1 / true).
    SELECT
        w.UserId,
        u.DisplayName,
        w.SubscribedAt,
        CASE WHEN w.UserId = @User THEN ISNULL(p.NotifyGateDecisions,          CAST(1 AS BIT)) END AS NotifyGateDecisions,
        CASE WHEN w.UserId = @User THEN ISNULL(p.NotifyStatusChanges,          CAST(1 AS BIT)) END AS NotifyStatusChanges,
        CASE WHEN w.UserId = @User THEN ISNULL(p.NotifyTaskSignoffs,           CAST(1 AS BIT)) END AS NotifyTaskSignoffs,
        CASE WHEN w.UserId = @User THEN ISNULL(p.NotifySlaAndDueDateReminders, CAST(1 AS BIT)) END AS NotifySlaAndDueDateReminders,
        CASE WHEN w.UserId = @User THEN ISNULL(p.NotifyMentionsAndComments,    CAST(1 AS BIT)) END AS NotifyMentionsAndComments
    FROM dbo.Watchers AS w
    INNER JOIN dbo.Users AS u ON u.UserId = w.UserId AND u.IsDeleted = 0
    LEFT JOIN dbo.WatcherNotificationPreference AS p
        ON p.UserId = w.UserId AND p.RecordId = w.RecordId AND p.WorkspaceId = w.WorkspaceId AND p.IsDeleted = 0
    WHERE w.RecordId = @Record
      AND w.WorkspaceId = @Ws
      AND w.UnsubscribedAt IS NULL
      AND w.IsDeleted = 0
    ORDER BY w.SubscribedAt DESC;
END;
GO
