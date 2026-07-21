-- =============================================
-- Author:      /dev-build-application (Slice 13) · reconciled 2026-07-21 (Depth C lifecycle)
-- Create Date: 2026-07-05
-- Description: Archives an announcement now ("Archive" in the reconciled UI) — Status → Archived from any
--              live, non-terminal state. Never a hard delete (§4.3). Idempotent: archiving an already-
--              Archived (or legacy Retired) row is a no-op success. The caller's author-or-admin right is
--              resolved in the service. @Found = 0 when no live row matched (→ 403, never disclosing
--              existence). Kept under its original name/signature so the service's manage path is
--              unchanged; the stored state is now Archived rather than Retired.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RetireAnnouncement
    @AnnouncementId UNIQUEIDENTIFIER,
    @UpdatedBy      NVARCHAR(256),
    @Found          BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id  UNIQUEIDENTIFIER = @AnnouncementId;
    DECLARE @By  NVARCHAR(256)    = @UpdatedBy;
    DECLARE @Now DATETIME2        = SYSUTCDATETIME();

    SET @Found = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF EXISTS (SELECT 1 FROM dbo.Announcements WHERE AnnouncementId = @Id AND IsDeleted = 0)
        BEGIN
            SET @Found = 1;

            UPDATE dbo.Announcements
            SET Status    = N'Archived',
                UpdatedAt = @Now,
                UpdatedBy = @By
            WHERE AnnouncementId = @Id AND IsDeleted = 0 AND Status NOT IN (N'Archived', N'Retired');
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
