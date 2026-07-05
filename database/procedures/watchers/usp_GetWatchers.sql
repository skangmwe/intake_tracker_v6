-- =============================================
-- Author:      /dev-build-application (Slice 12 — Watchers)
-- Create Date: 2026-07-05
-- Description: Lists the live watchers of a record on one side, with each watcher's DisplayName so
--              the Watchers card renders avatars without a directory fetch (mirrors slice 8's frozen
--              approver names). Access is gated on @UserId's membership of the record's workspace —
--              a caller who cannot see the record gets ZERO rows (the service resolves the record
--              first via usp_GetRequestByIdForUser, so a forbidden record is a 403 not an empty 200).
--              Newest subscription first. The service derives `isWatching` by matching @UserId.
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

    SELECT
        w.UserId,
        u.DisplayName,
        w.SubscribedAt
    FROM dbo.Watchers AS w
    INNER JOIN dbo.Users AS u ON u.UserId = w.UserId AND u.IsDeleted = 0
    WHERE w.RecordId = @Record
      AND w.WorkspaceId = @Ws
      AND w.UnsubscribedAt IS NULL
      AND w.IsDeleted = 0
    ORDER BY w.SubscribedAt DESC;
END;
GO
