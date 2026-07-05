-- =============================================
-- Author:      /dev-build-application (Slice 12 — Notifications)
-- Create Date: 2026-07-05
-- Description: The caller's bell feed — their own notifications across all workspaces, newest first,
--              paginated (OFFSET/FETCH). Scoped to @UserId, so there is no cross-user disclosure and
--              no record-access join is needed (a notification only exists because the fan-out already
--              resolved the caller as a legitimate target). @UnreadOnly filters to unread rows.
--              TotalCount rides as a windowed column (COUNT(*) OVER()) so the read is one result set
--              (matches the Comments FromSqlRaw pattern); an empty page yields no rows → caller uses 0.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryNotifications
    @UserId     UNIQUEIDENTIFIER,
    @Page       INT,
    @PageSize   INT,
    @UnreadOnly BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @User   UNIQUEIDENTIFIER = @UserId;
    DECLARE @PageL  INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size   INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @Unread BIT = ISNULL(@UnreadOnly, 0);

    SELECT
        n.NotificationId,
        n.Category,
        n.RecordId,
        n.AnnouncementId,
        n.Summary,
        n.SourceEventId,
        n.CreatedAt,
        n.ReadAt,
        COUNT(*) OVER () AS TotalCount
    FROM dbo.Notifications AS n
    WHERE n.UserId = @User
      AND n.IsDeleted = 0
      AND (@Unread = 0 OR n.ReadAt IS NULL)
    ORDER BY n.CreatedAt DESC, n.NotificationId DESC
    OFFSET (@PageL - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;
END;
GO
