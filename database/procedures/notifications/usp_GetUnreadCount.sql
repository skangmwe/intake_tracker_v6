-- =============================================
-- Author:      /dev-build-application (Slice 12 — Notifications)
-- Create Date: 2026-07-05
-- Description: The caller's unread notification count across all their workspaces — drives the bell
--              badge. Caller-scoped (@UserId), so no cross-user disclosure. Single-row result.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetUnreadCount
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @User UNIQUEIDENTIFIER = @UserId;

    SELECT COUNT(*) AS UnreadCount
    FROM dbo.Notifications AS n
    WHERE n.UserId = @User
      AND n.ReadAt IS NULL
      AND n.IsDeleted = 0;
END;
GO
