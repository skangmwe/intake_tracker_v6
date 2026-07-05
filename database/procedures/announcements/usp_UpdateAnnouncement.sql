-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Replaces the editable fields of an announcement (PATCH, api-contracts §12). The caller's
--              author-or-admin right and the row's existence are resolved in the service (which reads
--              usp_GetAnnouncementById first, so a forbidden/absent row is a uniform 403). This proc
--              applies the new complete editable set (Title, Body, Audience, Pinned, ExpiresOn) — a
--              Retired announcement is immutable, enforced here as defense in depth (§20: "edit until
--              Retired"). @Found = 0 when no live, non-retired row matched.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpdateAnnouncement
    @AnnouncementId UNIQUEIDENTIFIER,
    @Title          NVARCHAR(200),
    @Body           NVARCHAR(MAX),
    @Audience       NVARCHAR(MAX),
    @Pinned         BIT,
    @ExpiresOn      DATE,
    @UpdatedBy      NVARCHAR(256),
    @Found          BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id  UNIQUEIDENTIFIER = @AnnouncementId;
    DECLARE @T   NVARCHAR(200)    = @Title;
    DECLARE @B   NVARCHAR(MAX)    = @Body;
    DECLARE @Aud NVARCHAR(MAX)    = @Audience;
    DECLARE @Pin BIT              = ISNULL(@Pinned, 0);
    DECLARE @Exp DATE             = @ExpiresOn;
    DECLARE @By  NVARCHAR(256)    = @UpdatedBy;

    SET @Found = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Announcements
        SET Title     = @T,
            Body      = @B,
            Audience  = @Aud,
            Pinned    = @Pin,
            ExpiresOn = @Exp,
            UpdatedAt = SYSUTCDATETIME(),
            UpdatedBy = @By
        WHERE AnnouncementId = @Id
          AND IsDeleted = 0
          AND Status <> N'Retired';

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
