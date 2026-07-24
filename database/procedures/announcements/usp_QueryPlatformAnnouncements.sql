-- =============================================
-- Author:      Announcements platform broadcast
-- Create Date: 2026-07-24
-- Description: The platform-admin authoring list — every broadcast (BroadcastId IS NOT NULL) as one row,
--              across all workspaces. Platform-admin is enforced at the controller. All copies of a
--              broadcast share Title/Body/Status/timestamps by construction, so one representative copy
--              (lowest AnnouncementId per BroadcastId) supplies the content — returning the full Body so
--              the editor can pre-fill it — and a window COUNT gives WorkspaceCount (how many workspaces the
--              post fanned out to). Returns the stored Status plus lifecycle timestamps so the service
--              derives the single display status (Active / Scheduled / Archived) once, the poster's display
--              name, and PostedAt (published → else scheduled → else created). Pinned first then most-
--              recently-posted. Paginated (OFFSET/FETCH) with a windowed TotalCount = distinct broadcasts.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryPlatformAnnouncements
    @Page     INT,
    @PageSize INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @PageL INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size  INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;

    ;WITH ranked AS (
        SELECT
            a.BroadcastId,
            a.Title,
            a.Body,
            a.Pinned,
            a.Status,
            a.AuthorUserId,
            a.PublishedAt,
            a.ScheduledPublishAt,
            a.AutoArchive,
            a.AutoArchiveAt,
            a.CreatedAt,
            ROW_NUMBER() OVER (PARTITION BY a.BroadcastId ORDER BY a.AnnouncementId) AS Rn,
            COUNT(*)     OVER (PARTITION BY a.BroadcastId)                           AS WorkspaceCount
        FROM dbo.Announcements AS a
        WHERE a.BroadcastId IS NOT NULL
          AND a.IsDeleted = 0
    )
    SELECT
        r.BroadcastId,
        r.Title,
        r.Body,
        r.Pinned,
        r.PublishedAt,
        r.ScheduledPublishAt,
        r.AutoArchive,
        r.AutoArchiveAt,
        r.Status,
        r.AuthorUserId,
        u.DisplayName AS AuthorName,
        COALESCE(r.PublishedAt, r.ScheduledPublishAt, r.CreatedAt) AS PostedAt,
        r.WorkspaceCount,
        COUNT(*) OVER () AS TotalCount
    FROM ranked AS r
    LEFT JOIN dbo.Users AS u ON u.UserId = r.AuthorUserId
    WHERE r.Rn = 1
    ORDER BY r.Pinned DESC, COALESCE(r.PublishedAt, r.ScheduledPublishAt, r.CreatedAt) DESC, r.BroadcastId DESC
    OFFSET (@PageL - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;
END;
GO
