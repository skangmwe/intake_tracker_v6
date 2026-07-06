-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Sets a Feature's Maturity (publish → Published, deprecate → Deprecated). This is an
--              ordinary member edit with NO approval gate (BS §18.5), captured in audit API-side.
--              The transition is validated against the allowed set; Maturity is mirrored into the
--              field map so saved views read one source. No result set — the caller re-reads via
--              usp_GetFeatureByIdForUser. Membership is verified API-side.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_SetFeatureMaturity
    @RecordId    NVARCHAR(20),
    @WorkspaceId UNIQUEIDENTIFIER,
    @Maturity    NVARCHAR(16),
    @ActorUserId NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @Ws            UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @MaturityLocal NVARCHAR(16)     = @Maturity;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;

    IF @MaturityLocal NOT IN (N'Draft', N'Published', N'Deprecated')
        THROW 50041, N'usp_SetFeatureMaturity: invalid maturity value.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.Features WITH (UPDLOCK, ROWLOCK)
                       WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0)
            THROW 50043, N'usp_SetFeatureMaturity: feature not found.', 1;

        UPDATE dbo.Features
        SET Maturity    = @MaturityLocal,
            FieldValues = JSON_MODIFY(FieldValues, N'$.maturity', @MaturityLocal),
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
