-- =============================================
-- Author:      /dev-build-application (Slice 13) · reconciled 2026-07-21 (Depth C lifecycle)
-- Create Date: 2026-07-05
-- Description: The admin authoring list for one workspace (S23) — every announcement across all statuses,
--              pinned first then most-recently-posted. WorkspaceAdmin is enforced at the controller; this
--              proc is workspace-scoped and does not audience-filter. Returns the STORED status plus the
--              lifecycle timestamps (ScheduledPublishAt / AutoArchive / AutoArchiveAt / PublishedAt) so
--              the service derives the single display status (Active / Scheduled / Archived) once. Joins
--              dbo.Users for the poster's display name and surfaces PostedAt (published → else scheduled →
--              else created) for the POSTED column. Paginated (OFFSET/FETCH) with a windowed TotalCount.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryAnnouncementsForManage
    @WorkspaceId UNIQUEIDENTIFIER,
    @Page        INT,
    @PageSize    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @PageL INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size  INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;

    SELECT
        a.AnnouncementId,
        a.Title,
        LEFT(a.Body, 280) AS BodySnippet,
        a.Pinned,
        a.PublishedAt,
        a.ScheduledPublishAt,
        a.AutoArchive,
        a.AutoArchiveAt,
        a.Status,
        a.AuthorUserId,
        u.DisplayName AS AuthorName,
        COALESCE(a.PublishedAt, a.ScheduledPublishAt, a.CreatedAt) AS PostedAt,
        COUNT(*) OVER () AS TotalCount
    FROM dbo.Announcements AS a
    LEFT JOIN dbo.Users AS u ON u.UserId = a.AuthorUserId
    WHERE a.WorkspaceId = @Ws
      AND a.IsDeleted = 0
    ORDER BY a.Pinned DESC, COALESCE(a.PublishedAt, a.ScheduledPublishAt, a.CreatedAt) DESC, a.AnnouncementId DESC
    OFFSET (@PageL - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;
END;
GO
