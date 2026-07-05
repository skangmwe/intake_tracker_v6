-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Creates a Draft announcement in a workspace (BS §2.7 / §20). The caller's
--              WorkspaceAdmin right is enforced at the controller (AccessGuard, api-contracts §12);
--              this proc performs the insert and returns the new id via OUTPUT. Audience arrives as a
--              validated JSON document ({ kind, roleLabels?, userIds? }); the CK_Announcements_Audience
--              CHECK is the backstop. Status defaults to Draft — nothing fans until publish.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateAnnouncement
    @WorkspaceId    UNIQUEIDENTIFIER,
    @AuthorUserId   UNIQUEIDENTIFIER,
    @Title          NVARCHAR(200),
    @Body           NVARCHAR(MAX),
    @Audience       NVARCHAR(MAX),
    @Pinned         BIT,
    @ExpiresOn      DATE,
    @CreatedBy      NVARCHAR(256),
    @AnnouncementId UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws       UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Author   UNIQUEIDENTIFIER = @AuthorUserId;
    DECLARE @T        NVARCHAR(200)    = @Title;
    DECLARE @B        NVARCHAR(MAX)    = @Body;
    DECLARE @Aud      NVARCHAR(MAX)    = @Audience;
    DECLARE @Pin      BIT              = ISNULL(@Pinned, 0);
    DECLARE @Exp      DATE             = @ExpiresOn;
    DECLARE @By       NVARCHAR(256)    = @CreatedBy;
    DECLARE @NewId    UNIQUEIDENTIFIER;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Inserted TABLE (AnnouncementId UNIQUEIDENTIFIER);

        INSERT INTO dbo.Announcements
            (WorkspaceId, AuthorUserId, Title, Body, Audience, Pinned, ExpiresOn, Status,
             CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
        OUTPUT inserted.AnnouncementId INTO @Inserted
        VALUES
            (@Ws, @Author, @T, @B, @Aud, @Pin, @Exp, N'Draft',
             SYSUTCDATETIME(), SYSUTCDATETIME(), @By, @By);

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
