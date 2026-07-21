-- =============================================
-- Author:      /dev-build-application (Slice 13) · reconciled 2026-07-21 (Depth C lifecycle)
-- Create Date: 2026-07-05
-- Description: Creates an announcement in a workspace (BS §2.7 / §20). WorkspaceAdmin is enforced at the
--              controller; the chosen @AuthorUserId ("posted by") is validated there as a workspace
--              member (audit CreatedBy stays the acting admin). @Status is 'Published' (publish now) or
--              'Scheduled' (publish later at @ScheduledPublishAt). On Published the row is live at once
--              and PublishedAt / AutoArchiveAt (= PublishedAt + 30d when @AutoArchive = 1) are stamped;
--              on Scheduled only ScheduledPublishAt is set and the tick (usp_TickAnnouncements) publishes
--              it later. Audience arrives as a validated JSON document; the CK_Announcements_Audience
--              CHECK is the backstop. Fan-out for a Published row is emitted by the service through the
--              event spine (single-sourced with manual publish) — not here.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateAnnouncement
    @WorkspaceId        UNIQUEIDENTIFIER,
    @AuthorUserId       UNIQUEIDENTIFIER,
    @Title              NVARCHAR(200),
    @Body               NVARCHAR(MAX),
    @Audience           NVARCHAR(MAX),
    @Pinned             BIT,
    @ExpiresOn          DATE,
    @Status             NVARCHAR(16),
    @ScheduledPublishAt DATETIME2,
    @AutoArchive        BIT,
    @CreatedBy          NVARCHAR(256),
    @AnnouncementId     UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Author UNIQUEIDENTIFIER = @AuthorUserId;
    DECLARE @T     NVARCHAR(200)    = @Title;
    DECLARE @B     NVARCHAR(MAX)    = @Body;
    DECLARE @Aud   NVARCHAR(MAX)    = @Audience;
    DECLARE @Pin   BIT              = ISNULL(@Pinned, 0);
    DECLARE @Exp   DATE             = @ExpiresOn;
    DECLARE @St    NVARCHAR(16)     = ISNULL(@Status, N'Published');
    DECLARE @Sched DATETIME2        = @ScheduledPublishAt;
    DECLARE @AA    BIT              = ISNULL(@AutoArchive, 1);
    DECLARE @By    NVARCHAR(256)    = @CreatedBy;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();
    DECLARE @NewId UNIQUEIDENTIFIER;

    -- Status-dependent timestamps. Published → live now; Scheduled → holds until the tick.
    DECLARE @PublishedAt   DATETIME2 = CASE WHEN @St = N'Published' THEN @Now ELSE NULL END;
    DECLARE @SchedStamp    DATETIME2 = CASE WHEN @St = N'Scheduled' THEN @Sched ELSE NULL END;
    DECLARE @AutoArchiveAt DATETIME2 =
        CASE WHEN @St = N'Published' AND @AA = 1 THEN DATEADD(DAY, 30, @Now) ELSE NULL END;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Inserted TABLE (AnnouncementId UNIQUEIDENTIFIER);

        INSERT INTO dbo.Announcements
            (WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, ExpiresOn, Status,
             ScheduledPublishAt, AutoArchive, AutoArchiveAt, PublishedAt,
             CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
        OUTPUT inserted.AnnouncementId INTO @Inserted
        VALUES
            (@Ws, @Author, @T, @B, @Aud, @Pin, @Exp, @St,
             @SchedStamp, @AA, @AutoArchiveAt, @PublishedAt,
             @Now, @Now, @By, @By);

        SELECT @NewId = AnnouncementId FROM @Inserted;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SET @AnnouncementId = @NewId;
END;
GO
