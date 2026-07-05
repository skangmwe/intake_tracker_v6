-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Publishes an announcement (api-contracts §12) — Draft → Published, stamping PublishedAt
--              on the first transition. Idempotent: re-publishing an already-Published row is a no-op
--              success and does NOT re-stamp or re-fan (@NewlyPublished = 0). A Retired row cannot be
--              published (@Found = 0). The caller's author-or-admin right is resolved in the service.
--              @WorkspaceId is returned so the service can build the announcement.published event whose
--              fan-out (usp_FanOutNotification) delivers "Announcement posted" to the audience's bells.
--              @NewlyPublished = 1 only on the Draft→Published transition, so the service emits the
--              fan-out event exactly once.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_PublishAnnouncement
    @AnnouncementId  UNIQUEIDENTIFIER,
    @UpdatedBy       NVARCHAR(256),
    @Found           BIT OUTPUT,
    @NewlyPublished  BIT OUTPUT,
    @WorkspaceId     UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id UNIQUEIDENTIFIER = @AnnouncementId;
    DECLARE @By NVARCHAR(256)    = @UpdatedBy;

    SET @Found = 0;
    SET @NewlyPublished = 0;
    SET @WorkspaceId = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Status NVARCHAR(16);
        SELECT @Status = Status, @WorkspaceId = WorkspaceId
        FROM dbo.Announcements
        WHERE AnnouncementId = @Id AND IsDeleted = 0;

        IF @Status IS NOT NULL AND @Status <> N'Retired'
        BEGIN
            SET @Found = 1;

            IF @Status = N'Draft'
            BEGIN
                UPDATE dbo.Announcements
                SET Status      = N'Published',
                    PublishedAt = ISNULL(PublishedAt, SYSUTCDATETIME()),
                    UpdatedAt   = SYSUTCDATETIME(),
                    UpdatedBy   = @By
                WHERE AnnouncementId = @Id AND IsDeleted = 0 AND Status = N'Draft';

                IF @@ROWCOUNT > 0
                    SET @NewlyPublished = 1;
            END
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
