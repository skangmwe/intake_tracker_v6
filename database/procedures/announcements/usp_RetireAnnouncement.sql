-- =============================================
-- Author:      /dev-build-application (Slice 13 — Announcements)
-- Create Date: 2026-07-05
-- Description: Retires an announcement (api-contracts §12) — Status → Retired from any live state.
--              Never a hard delete (§4.3). Idempotent: retiring an already-Retired row is a no-op
--              success. The caller's author-or-admin right is resolved in the service. @Found = 0 when
--              no live row matched (→ the service returns 403, never disclosing existence).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RetireAnnouncement
    @AnnouncementId UNIQUEIDENTIFIER,
    @UpdatedBy      NVARCHAR(256),
    @Found          BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id UNIQUEIDENTIFIER = @AnnouncementId;
    DECLARE @By NVARCHAR(256)    = @UpdatedBy;

    SET @Found = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF EXISTS (SELECT 1 FROM dbo.Announcements WHERE AnnouncementId = @Id AND IsDeleted = 0)
        BEGIN
            SET @Found = 1;

            UPDATE dbo.Announcements
            SET Status    = N'Retired',
                UpdatedAt = SYSUTCDATETIME(),
                UpdatedBy = @By
            WHERE AnnouncementId = @Id AND IsDeleted = 0 AND Status <> N'Retired';
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
