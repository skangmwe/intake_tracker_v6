-- =============================================
-- Author:      Announcements platform broadcast
-- Create Date: 2026-07-24
-- Description: Archives every per-workspace copy of a platform broadcast now (never a hard delete). Mirrors
--              usp_RetireAnnouncement but scoped to all non-terminal copies sharing @BroadcastId. Platform-
--              admin is enforced at the controller. Idempotent: archiving an already-terminal broadcast is a
--              no-op success. @Found = 0 when no live copy matched (→ 403, never disclosing existence).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_RetireBroadcast
    @BroadcastId UNIQUEIDENTIFIER,
    @UpdatedBy   NVARCHAR(256),
    @Found       BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bc  UNIQUEIDENTIFIER = @BroadcastId;
    DECLARE @By  NVARCHAR(256)    = @UpdatedBy;
    DECLARE @Now DATETIME2        = SYSUTCDATETIME();

    SET @Found = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF EXISTS (SELECT 1 FROM dbo.Announcements WHERE BroadcastId = @Bc AND IsDeleted = 0)
        BEGIN
            SET @Found = 1;

            UPDATE dbo.Announcements
            SET Status    = N'Archived',
                UpdatedAt = @Now,
                UpdatedBy = @By
            WHERE BroadcastId = @Bc AND IsDeleted = 0 AND Status NOT IN (N'Archived', N'Retired');
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
