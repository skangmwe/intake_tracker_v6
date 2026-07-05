-- =============================================
-- Author:      /dev-build-application (Slice 12 — Notifications)
-- Create Date: 2026-07-05
-- Description: Marks one notification read. Only the caller's own row — @Found returns 0 when the id
--              is not the caller's (or does not exist), so the API answers 403 without disclosing that
--              someone else's notification exists (BS §22.6). Idempotent: marking an already-read row
--              leaves ReadAt unchanged and still returns @Found = 1.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_MarkNotificationRead
    @NotificationId UNIQUEIDENTIFIER,
    @UserId         UNIQUEIDENTIFIER,
    @Found          BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id    UNIQUEIDENTIFIER = @NotificationId;
    DECLARE @User  UNIQUEIDENTIFIER = @UserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();
    DECLARE @ByTxt NVARCHAR(256)    = CAST(@UserId AS NVARCHAR(256));

    SET @Found = 0;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.Notifications
        WHERE NotificationId = @Id AND UserId = @User AND IsDeleted = 0)
        RETURN;

    SET @Found = 1;

    UPDATE dbo.Notifications
    SET ReadAt    = ISNULL(ReadAt, @Now),
        UpdatedAt = @Now,
        UpdatedBy = @ByTxt
    WHERE NotificationId = @Id AND UserId = @User AND ReadAt IS NULL AND IsDeleted = 0;
END;
GO
