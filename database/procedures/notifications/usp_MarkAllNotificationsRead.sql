-- =============================================
-- Author:      /dev-build-application (Slice 12 — Notifications)
-- Create Date: 2026-07-05
-- Description: Marks all of the caller's unread notifications read (the bell "Mark all read" action).
--              Caller-scoped (@UserId). Idempotent — a second call is a no-op.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_MarkAllNotificationsRead
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @User  UNIQUEIDENTIFIER = @UserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();
    DECLARE @ByTxt NVARCHAR(256)    = CAST(@UserId AS NVARCHAR(256));

    UPDATE dbo.Notifications
    SET ReadAt    = @Now,
        UpdatedAt = @Now,
        UpdatedBy = @ByTxt
    WHERE UserId = @User AND ReadAt IS NULL AND IsDeleted = 0;
END;
GO
