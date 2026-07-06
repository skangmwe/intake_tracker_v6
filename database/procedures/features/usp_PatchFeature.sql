-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Partial update of a Feature's editable content (name, field map). Optimistic
--              concurrency: the caller passes the RowVer it last read as @IfMatchRowVer; if the
--              row's current RowVer differs, the proc THROWs 50040 (stale-record → API 409). Name
--              is mirrored into the field map so saved views stay consistent. Maturity is NOT
--              touched here — publish/deprecate go through usp_SetFeatureMaturity. No result set —
--              the caller re-reads via usp_GetFeatureByIdForUser. Membership is verified API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_PatchFeature
    @RecordId        NVARCHAR(20),
    @WorkspaceId     UNIQUEIDENTIFIER,
    @Name            NVARCHAR(400),
    @FieldValuesJson NVARCHAR(MAX),
    @IfMatchRowVer   VARBINARY(8),
    @ActorUserId     NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @Ws            UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @NameLocal     NVARCHAR(400)    = @Name;
    DECLARE @FieldsLocal   NVARCHAR(MAX)    = ISNULL(@FieldValuesJson, N'{}');
    DECLARE @IfMatch       VARBINARY(8)     = @IfMatchRowVer;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;
    DECLARE @CurrentRowVer VARBINARY(8);
    DECLARE @CurrentMaturity NVARCHAR(16);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @CurrentRowVer = RowVer, @CurrentMaturity = Maturity
        FROM dbo.Features WITH (UPDLOCK, ROWLOCK)
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        IF @CurrentRowVer IS NULL
            THROW 50043, N'usp_PatchFeature: feature not found.', 1;

        IF @IfMatch IS NULL OR @CurrentRowVer <> @IfMatch
            THROW 50040, N'usp_PatchFeature: the record was modified by someone else (stale ETag).', 1;

        -- Keep the field map's mirrored name + maturity in sync with the promoted columns.
        SET @FieldsLocal = JSON_MODIFY(JSON_MODIFY(@FieldsLocal, N'$.name', @NameLocal), N'$.maturity', @CurrentMaturity);

        UPDATE dbo.Features
        SET Name        = @NameLocal,
            FieldValues = @FieldsLocal,
            UpdatedBy   = @Actor,
            UpdatedAt   = SYSUTCDATETIME()
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
