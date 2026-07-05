-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Reads one announcement for a caller (S21 detail, api-contracts §12). Returns the row
--              only when the caller may see it — the author, a WorkspaceAdmin of its workspace (either
--              may read any status for management/preview), OR a workspace member the Published, not-yet-
--              expired announcement's audience resolves to (everyone / role-scoped via
--              ApproverTeamMembership / named-users, §10.2). A caller who cannot see it gets ZERO rows,
--              which the service maps to 403 — never disclosing existence (BS §22.6). An expired
--              Published announcement is treated as Retired for consumers (§20) but stays visible to the
--              author/admin. AuthorUserId + Status + WorkspaceId ride along so the service can gate
--              manage actions without a second read.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetAnnouncementById
    @AnnouncementId UNIQUEIDENTIFIER,
    @UserId         UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id    UNIQUEIDENTIFIER = @AnnouncementId;
    DECLARE @User  UNIQUEIDENTIFIER = @UserId;
    DECLARE @Today DATE             = CAST(SYSUTCDATETIME() AS DATE);

    SELECT
        a.AnnouncementId,
        a.WorkspaceId,
        a.AuthorUserId,
        a.Title,
        a.Body,
        a.Audience,
        a.Pinned,
        a.ExpiresOn,
        a.Status,
        a.PublishedAt,
        a.CreatedAt,
        a.UpdatedAt
    FROM dbo.Announcements AS a
    WHERE a.AnnouncementId = @Id
      AND a.IsDeleted = 0
      AND (
            -- Author or a WorkspaceAdmin may read any status (manage / preview).
            a.AuthorUserId = @User
            OR EXISTS (
                SELECT 1 FROM dbo.WorkspaceMembership AS m
                WHERE m.WorkspaceId = a.WorkspaceId AND m.UserId = @User
                  AND m.Level = N'WorkspaceAdmin' AND m.IsDeleted = 0)
            -- Otherwise: a member the Published, un-expired announcement's audience resolves to.
            OR (
                a.Status = N'Published'
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
            )
          );
END;
GO
