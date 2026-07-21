-- =============================================
-- Author:      /dev-build-application (Slice 13) · reconciled 2026-07-21 (Depth C lifecycle)
-- Create Date: 2026-07-05
-- Description: Publishes an announcement now — Draft or Scheduled → Published, stamping PublishedAt on the
--              first transition and AutoArchiveAt = PublishedAt + 30d when AutoArchive = 1 (and clearing
--              any pending ScheduledPublishAt). Idempotent: re-publishing an already-Published row is a
--              no-op success and does NOT re-stamp or re-fan (@NewlyPublished = 0). Archived/Retired rows
--              cannot be published (@Found = 0). @WorkspaceId is returned so the service can build the
--              announcement.published event whose fan-out (usp_FanOutNotification) delivers to bells;
--              @NewlyPublished = 1 only on the transition, so the service emits exactly once.
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

    DECLARE @Id  UNIQUEIDENTIFIER = @AnnouncementId;
    DECLARE @By  NVARCHAR(256)    = @UpdatedBy;
    DECLARE @Now DATETIME2        = SYSUTCDATETIME();

    SET @Found = 0;
    SET @NewlyPublished = 0;
    SET @WorkspaceId = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Status NVARCHAR(16);
        SELECT @Status = Status, @WorkspaceId = WorkspaceId
        FROM dbo.Announcements
        WHERE AnnouncementId = @Id AND IsDeleted = 0;

        IF @Status IS NOT NULL AND @Status NOT IN (N'Retired', N'Archived')
        BEGIN
            SET @Found = 1;

            IF @Status IN (N'Draft', N'Scheduled')
            BEGIN
                UPDATE dbo.Announcements
                SET Status             = N'Published',
                    PublishedAt        = ISNULL(PublishedAt, @Now),
                    AutoArchiveAt      = CASE WHEN AutoArchive = 1
                                              THEN DATEADD(DAY, 30, ISNULL(PublishedAt, @Now))
                                              ELSE NULL END,
                    ScheduledPublishAt = NULL,
                    UpdatedAt          = @Now,
                    UpdatedBy          = @By
                WHERE AnnouncementId = @Id AND IsDeleted = 0 AND Status IN (N'Draft', N'Scheduled');

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
