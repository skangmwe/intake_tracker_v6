-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: The caller's browsable announcement history (S22, api-contracts §12) across every
--              workspace they belong to — Published, not-yet-expired, and audience-resolved to the
--              caller (everyone / role-scoped via ApproverTeamMembership / named-users, §10.2). Like the
--              bell feed this is caller-scoped (no cross-user disclosure); an announcement never widens
--              access. Pinned first, then newest published. Paginated (OFFSET/FETCH); TotalCount rides
--              as a windowed column so the read is one result set (matches usp_QueryNotifications).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_QueryAnnouncements
    @UserId   UNIQUEIDENTIFIER,
    @Page     INT,
    @PageSize INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @User  UNIQUEIDENTIFIER = @UserId;
    DECLARE @PageL INT  = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size  INT  = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);

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
    WHERE a.IsDeleted = 0
      AND a.Status = N'Published'
      AND (a.ExpiresOn IS NULL OR a.ExpiresOn > @Today)
      AND EXISTS (
            SELECT 1 FROM dbo.WorkspaceMembership AS m
            WHERE m.WorkspaceId = a.WorkspaceId AND m.UserId = @User AND m.IsDeleted = 0)
      AND (
            JSON_VALUE(a.Audience, N'$.kind') = N'everyone'
            OR (JSON_VALUE(a.Audience, N'$.kind') = N'named-users'
                AND EXISTS (
                    SELECT 1 FROM OPENJSON(a.Audience, N'$.userIds') AS uid
                    WHERE TRY_CONVERT(UNIQUEIDENTIFIER, uid.[value]) = @User))
            OR (JSON_VALUE(a.Audience, N'$.kind') = N'role-scoped'
                AND EXISTS (
                    SELECT 1
                    FROM OPENJSON(a.Audience, N'$.roleLabels') AS rl
                    INNER JOIN dbo.ApproverTeamMembership AS atm
                        ON atm.RoleLabel = rl.[value]
                       AND atm.WorkspaceId = a.WorkspaceId
                       AND atm.UserId = @User
                       AND atm.IsDeleted = 0))
          )
    ORDER BY a.Pinned DESC, a.PublishedAt DESC, a.AnnouncementId DESC
    OFFSET (@PageL - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;
END;
GO
