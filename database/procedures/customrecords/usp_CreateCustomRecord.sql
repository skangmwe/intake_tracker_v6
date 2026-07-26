-- =============================================
-- Author:      /dev-build-application (Slice 1b — Custom-object records: record CRUD API)
-- Create Date: 2026-07-24
-- Description: Inserts one custom-object record and returns its new id. Validates that the target
--              object exists (active) in the workspace before inserting — a record can never bind to
--              a foreign or deleted object. FieldValues is stored as-is (the API sends the full map);
--              it is Confidential and never logged (api-pii-handling.md).
--              Updated 2026-07-26 (SP3b Slice 1) — the existence check also accepts a Global object
--              (WorkspaceId NULL, Location='Global') as a valid target from any workspace; the
--              inserted record still carries the caller's own @WorkspaceId.
--
--              Error contract:
--                50083 → the object definition was not found (active) in this workspace.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateCustomRecord
    @WorkspaceId        UNIQUEIDENTIFIER,
    @ObjectDefinitionId UNIQUEIDENTIFIER,
    @Name               NVARCHAR(400),
    @FieldValuesJson    NVARCHAR(MAX),
    @ActorUserId        NVARCHAR(256),
    @RecordId           UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws    UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Obj   UNIQUEIDENTIFIER = @ObjectDefinitionId;
    DECLARE @Nm    NVARCHAR(400)    = @Name;
    DECLARE @Json  NVARCHAR(MAX)    = ISNULL(@FieldValuesJson, N'{}');
    DECLARE @Actor NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now   DATETIME2        = SYSUTCDATETIME();
    DECLARE @Id    UNIQUEIDENTIFIER = NEWID();

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.ObjectDefinition
            WHERE ObjectDefinitionId = @Obj
              AND (WorkspaceId = @Ws OR (WorkspaceId IS NULL AND Location = N'Global'))
              AND IsDeleted = 0)
            THROW 50083, 'Object definition not found in this workspace.', 1;

        INSERT INTO dbo.CustomRecords
            (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues,
             CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
        VALUES
            (@Id, @Obj, @Ws, @Nm, @Json,
             @Now, @Now, @Actor, @Actor);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SET @RecordId = @Id;
END;
GO
