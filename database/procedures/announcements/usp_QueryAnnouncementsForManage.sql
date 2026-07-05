-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: The admin authoring list for one workspace (S23, api-contracts §12) — every
--              announcement in the workspace across all statuses (Draft / Published / Retired), pinned
--              first then newest. WorkspaceAdmin is enforced at the controller (AccessGuard); this proc
--              is workspace-scoped and does not audience-filter. Effective status collapses an expired
--              Published row to Retired so the admin sees its true state (§20). Paginated (OFFSET/FETCH)
--              with a windowed TotalCount.
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
    DECLARE @PageL INT  = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size  INT  = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);

    SELECT
        a.AnnouncementId,
        a.Title,
        LEFT(a.Body, 280) AS BodySnippet,
        a.Pinned,
        a.PublishedAt,
        CASE
            WHEN a.Status = N'Published' AND a.ExpiresOn IS NOT NULL AND a.ExpiresOn <= @Today
                THEN N'Retired'
            ELSE a.Status
        END AS Status,
        a.AuthorUserId,
        COUNT(*) OVER () AS TotalCount
    FROM dbo.Announcements AS a
    WHERE a.WorkspaceId = @Ws
      AND a.IsDeleted = 0
    ORDER BY a.Pinned DESC, COALESCE(a.PublishedAt, a.CreatedAt) DESC, a.AnnouncementId DESC
    OFFSET (@PageL - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;
END;
GO
