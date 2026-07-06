-- =============================================
-- Author:      /dev-build-application (Slice 22 — Home surface)
-- Create Date: 2026-07-06
-- Description: Home pinned-announcement strip (BS §10.7 / §2.7). Returns @WorkspaceId's Published,
--              pinned, not-yet-expired announcements whose audience resolves to the caller (everyone /
--              named-users / role-scoped via ApproverTeamMembership — §10.2), newest published first.
--              Same audience gate as usp_QueryAnnouncements (an announcement never widens access), but
--              scoped to a single workspace + Pinned = 1. Caller-scoped: no cross-user disclosure.
--              Capped by @Top (the strip shows the freshest). BodySnippet is the first 280 chars.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetHomePinnedAnnouncements
    @UserId      UNIQUEIDENTIFIER,
    @WorkspaceId UNIQUEIDENTIFIER,
    @Top         INT = 5
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @User  UNIQUEIDENTIFIER = @UserId;
    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @TopL  INT  = CASE WHEN @Top < 1 THEN 5 WHEN @Top > 100 THEN 100 ELSE @Top END;
    DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);

    SELECT TOP (@TopL)
        a.AnnouncementId       AS AnnouncementId,
        a.Title                AS Title,
        LEFT(a.Body, 280)      AS BodySnippet,
        a.PublishedAt          AS PublishedAt
    FROM dbo.Announcements AS a
    WHERE a.IsDeleted = 0
      AND a.WorkspaceId = @Ws
      AND a.Status = N'Published'
      AND a.Pinned = 1
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
    ORDER BY a.PublishedAt DESC, a.AnnouncementId DESC;
END;
GO
