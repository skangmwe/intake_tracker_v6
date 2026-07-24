-- =============================================
-- Author:      /dev-build-application (Slice 1b — Custom-object records: record CRUD API)
-- Create Date: 2026-07-24
-- Description: Soft-deletes one custom-object record in scope (workspace + object). A record of
--              another workspace/object, or one already deleted, matches 0 rows → THROW 50043 (the
--              caller maps to 404). A second delete of the same record is therefore a no-op that
--              raises 50043 (idempotent-safe: the row stays soft-deleted, nothing is double-applied).
--
--              Error contract:
--                50043 → the record was not found (active) in this workspace + object.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeleteCustomRecord
    @RecordId           UNIQUEIDENTIFIER,
    @WorkspaceId        UNIQUEIDENTIFIER,
    @ObjectDefinitionId UNIQUEIDENTIFIER,
    @ActorUserId        NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Id    UNIQUEIDENTIFIER = @RecordId;
    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Obj   UNIQUEIDENTIFIER = @ObjectDefinitionId;
    DECLARE @Actor NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.CustomRecords
           SET IsDeleted = 1,
               DeletedAt = @Now,
               UpdatedBy = @Actor,
               UpdatedAt = @Now
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
