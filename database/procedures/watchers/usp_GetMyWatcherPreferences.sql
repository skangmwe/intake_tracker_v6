-- =============================================
-- Author:      /dev-review-and-remediate (Slice 26 — Watchers prototype reconciliation)
-- Create Date: 2026-07-17
-- Description: Returns the caller's five effective notification preferences for @RecordId,
--              INDEPENDENT of whether the caller is currently watching. The Watchers & alerts
--              tab shows the preference toggles always (prototype-wins reconciliation), so the
--              UI needs the caller's own preferences even before they subscribe — usp_GetWatchers
--              only projects them onto an existing watcher row, so a non-watcher's toggles would
--              otherwise read back as defaults. A missing preference row means all five default
--              to 1/true (the opt-out model), so this ALWAYS returns exactly one row.
--
--              Caller visibility/membership is enforced upstream by the service
--              (usp_GetRequestByIdForUser → 403 before this proc runs), so no gate here — and
--              the SELECT is unconditional, keeping the EF FromSql<MyWatcherPreferencesRow>
--              result-set shape stable regardless of watch state (cf. the usp_GetBridgeForRecord
--              early-RETURN fix — a proc read via FromSql must never return zero result sets).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetMyWatcherPreferences
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

    SELECT
        ISNULL(p.NotifyGateDecisions,          CAST(1 AS BIT)) AS NotifyGateDecisions,
        ISNULL(p.NotifyStatusChanges,          CAST(1 AS BIT)) AS NotifyStatusChanges,
        ISNULL(p.NotifyTaskSignoffs,           CAST(1 AS BIT)) AS NotifyTaskSignoffs,
        ISNULL(p.NotifySlaAndDueDateReminders, CAST(1 AS BIT)) AS NotifySlaAndDueDateReminders,
        ISNULL(p.NotifyMentionsAndComments,    CAST(1 AS BIT)) AS NotifyMentionsAndComments
    FROM (VALUES (1)) AS s(x)
    LEFT JOIN dbo.WatcherNotificationPreference AS p
        ON p.UserId = @User
       AND p.RecordId = @Record
       AND p.WorkspaceId = @Ws
       AND p.IsDeleted = 0;
END;
GO
