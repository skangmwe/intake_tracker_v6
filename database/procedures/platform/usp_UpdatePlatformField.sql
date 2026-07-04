-- =============================================
-- Author:      /dev-build-application (Slice 3 — Fields & objects schema engine)
-- Create Date: 2026-07-03
-- Description: Updates a platform-defined field's definition (S34) — DisplayName and, for
--              Select fields, the option set. Only a Platform admin reaches this proc, and
--              the edit applies to every workspace at once because the definition is central
--              (BS §4.3). Guards:
--                - System fields (IsSystemImmutable = 1) are immutable to everyone — THROW.
--                - AI Solutions Status keeps HasManualWritePath = 0 (no data write path);
--                  only its DEFINITION (name / options) is editable here, never a value.
--              @SelectOptionsJson is a JSON array of option values, or NULL to leave
--              unchanged for a non-select field.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpdatePlatformField
    @FieldKey          NVARCHAR(64),
    @DisplayName       NVARCHAR(200),
    @SelectOptionsJson NVARCHAR(MAX) = NULL,
    @ActorUserId       NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FieldKeyLocal NVARCHAR(64)  = @FieldKey;
    DECLARE @Actor         NVARCHAR(256) = @ActorUserId;
    DECLARE @Now           DATETIME2     = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IsSystemImmutable BIT;
        SELECT @IsSystemImmutable = IsSystemImmutable
        FROM dbo.PlatformField WHERE FieldKey = @FieldKeyLocal AND IsDeleted = 0;

        IF @IsSystemImmutable IS NULL
            THROW 50014, 'Platform field not found.', 1;

        IF @IsSystemImmutable = 1
            THROW 50015, 'This is a system field and is immutable to everyone, including Platform admins.', 1;

        UPDATE dbo.PlatformField
        SET DisplayName = @DisplayName,
            SelectOptionsJson = CASE WHEN @SelectOptionsJson IS NULL THEN SelectOptionsJson ELSE @SelectOptionsJson END,
            UpdatedBy = @Actor, UpdatedAt = @Now
        WHERE FieldKey = @FieldKeyLocal AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
