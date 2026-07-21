-- =============================================
-- Author:      /dev-build-application (Slice 13) · reconciled 2026-07-21 (Depth C lifecycle)
-- Create Date: 2026-07-05
-- Description: Replaces the editable fields of an announcement (PATCH). Author-or-admin and the row's
--              existence are resolved in the service (uniform 403). Editable until terminal — a
--              Retired (legacy) or Archived row is immutable (defense in depth). Applies the reconciled
--              editable set: Title, Body, Audience, Pinned, AuthorUserId ("posted by"), AutoArchive, and
--              the target @Status ('Published' | 'Scheduled'). Status-dependent timestamps are recomputed
--              from the pre-update row (SET right-hand expressions read pre-update values): Scheduled
--              parks ScheduledPublishAt and clears PublishedAt/AutoArchiveAt; Published stamps
--              PublishedAt (now, if not already published — a Scheduled→Published edit publishes now) and
--              AutoArchiveAt = PublishedAt + 30d when @AutoArchive = 1. Fan-out on a transition into
--              Published is emitted by the service through the event spine. @Found = 0 when no editable
--              row matched.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpdateAnnouncement
    @AnnouncementId     UNIQUEIDENTIFIER,
    @Title              NVARCHAR(200),
    @Body               NVARCHAR(MAX),
    @Audience           NVARCHAR(MAX),
    @Pinned             BIT,
    @AuthorUserId       UNIQUEIDENTIFIER,
    @Status             NVARCHAR(16),
    @ScheduledPublishAt DATETIME2,
    @AutoArchive        BIT,
    @ExpiresOn          DATE,
    @UpdatedBy          NVARCHAR(256),
    @Found              BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id     UNIQUEIDENTIFIER = @AnnouncementId;
    DECLARE @T      NVARCHAR(200)    = @Title;
    DECLARE @B      NVARCHAR(MAX)    = @Body;
    DECLARE @Aud    NVARCHAR(MAX)    = @Audience;
    DECLARE @Pin    BIT              = ISNULL(@Pinned, 0);
    DECLARE @Author UNIQUEIDENTIFIER = @AuthorUserId;
    DECLARE @St     NVARCHAR(16)     = ISNULL(@Status, N'Published');
    DECLARE @Sched  DATETIME2        = @ScheduledPublishAt;
    DECLARE @AA     BIT              = ISNULL(@AutoArchive, 1);
    DECLARE @Exp    DATE             = @ExpiresOn;
    DECLARE @By     NVARCHAR(256)    = @UpdatedBy;
    DECLARE @Now    DATETIME2        = SYSUTCDATETIME();

    SET @Found = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Announcements
        SET Title              = @T,
            Body               = @B,
            Audience           = @Aud,
            Pinned             = @Pin,
            AuthorUserId       = @Author,
            ExpiresOn          = @Exp,
            AutoArchive        = @AA,
            Status             = @St,
            ScheduledPublishAt = CASE WHEN @St = N'Scheduled' THEN @Sched ELSE NULL END,
            PublishedAt        = CASE WHEN @St = N'Published' THEN ISNULL(PublishedAt, @Now) ELSE NULL END,
            AutoArchiveAt      = CASE
                                     WHEN @St = N'Published' AND @AA = 1
                                         THEN DATEADD(DAY, 30, ISNULL(PublishedAt, @Now))
                                     ELSE NULL
                                 END,
            UpdatedAt          = @Now,
            UpdatedBy          = @By
        WHERE AnnouncementId = @Id
          AND IsDeleted = 0
          AND Status NOT IN (N'Archived', N'Retired');

        IF @@ROWCOUNT > 0
            SET @Found = 1;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
