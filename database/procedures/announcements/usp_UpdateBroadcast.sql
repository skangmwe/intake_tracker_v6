-- =============================================
-- Author:      Announcements platform broadcast
-- Create Date: 2026-07-24
-- Description: Edits every per-workspace copy of a platform broadcast in one call (author/platform-admin is
--              enforced at the controller). Applies the content field-set — Title, Body, Pinned, target
--              @Status ('Published' | 'Scheduled'), ScheduledPublishAt, AutoArchive, ExpiresOn — to all
--              non-terminal copies sharing @BroadcastId. Audience and AuthorUserId are NOT changed (platform
--              posts are always everyone, authored by the acting admin). Status-dependent timestamps are
--              recomputed per row from its pre-update value (same rule as usp_UpdateAnnouncement): Scheduled
--              parks ScheduledPublishAt and clears PublishedAt/AutoArchiveAt; Published stamps PublishedAt
--              (now, if not already published) and AutoArchiveAt = PublishedAt + 30d when @AutoArchive = 1.
--              Fan-out on a transition into Published is emitted by the service per copy through the event
--              spine. @Found = 0 when no editable copy matched.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpdateBroadcast
    @BroadcastId        UNIQUEIDENTIFIER,
    @Title              NVARCHAR(200),
    @Body               NVARCHAR(MAX),
    @Pinned             BIT,
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

    DECLARE @Bc    UNIQUEIDENTIFIER = @BroadcastId;
    DECLARE @T     NVARCHAR(200)    = @Title;
    DECLARE @B     NVARCHAR(MAX)    = @Body;
    DECLARE @Pin   BIT              = ISNULL(@Pinned, 0);
    DECLARE @St    NVARCHAR(16)     = ISNULL(@Status, N'Published');
    DECLARE @Sched DATETIME2        = @ScheduledPublishAt;
    DECLARE @AA    BIT              = ISNULL(@AutoArchive, 1);
    DECLARE @Exp   DATE             = @ExpiresOn;
    DECLARE @By    NVARCHAR(256)    = @UpdatedBy;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();

    SET @Found = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Announcements
        SET Title              = @T,
            Body               = @B,
            Pinned             = @Pin,
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
        WHERE BroadcastId = @Bc
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
