-- =============================================
-- Author:      /dev-build-application (Slice 1b — Custom-object records: record CRUD API)
-- Create Date: 2026-07-24
-- Description: Updates one custom-object record's Name and FieldValues in scope (workspace + object).
--              The API sends the full field map, so FieldValues is REPLACED wholesale (not merged).
--              A record of another workspace/object, or a soft-deleted one, matches 0 rows → THROW
--              50043 (the caller maps to 404, never disclosing existence). FieldValues is Confidential
--              — never logged (api-pii-handling.md).
--
--              Error contract:
--                50043 → the record was not found (active) in this workspace + object.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_PatchCustomRecord
    @RecordId           UNIQUEIDENTIFIER,
    @WorkspaceId        UNIQUEIDENTIFIER,
    @ObjectDefinitionId UNIQUEIDENTIFIER,
    @Name               NVARCHAR(400),
    @FieldValuesJson    NVARCHAR(MAX),
    @ActorUserId        NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id    UNIQUEIDENTIFIER = @RecordId;
    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Obj   UNIQUEIDENTIFIER = @ObjectDefinitionId;
    DECLARE @Nm    NVARCHAR(400)    = @Name;
    DECLARE @Json  NVARCHAR(MAX)    = ISNULL(@FieldValuesJson, N'{}');
    DECLARE @Actor NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.CustomRecords
           SET Name        = @Nm,
               FieldValues = @Json,
               UpdatedBy   = @Actor,
               UpdatedAt   = @Now
         WHERE RecordId           = @Id
           AND WorkspaceId        = @Ws
           AND ObjectDefinitionId = @Obj
           AND IsDeleted          = 0;

        IF @@ROWCOUNT = 0
            THROW 50043, 'Custom record not found.', 1;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
