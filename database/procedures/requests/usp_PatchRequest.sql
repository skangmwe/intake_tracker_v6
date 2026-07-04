-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Partial update of a Request's editable content (name, description, field map).
--              Optimistic concurrency: the caller passes the RowVer it last read as @IfMatchRowVer;
--              if the row's current RowVer differs, the proc THROWs 50040 (stale-record → API 409,
--              per api-contracts.md). Name is mirrored into the field map so the condition engine
--              stays consistent. Stage + hold have their own procs and are not touched here.
--              No result set — the caller re-reads via usp_GetRequestByIdForUser. Workspace
--              membership + field-level lock checks happen API-side before this runs.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_PatchRequest
    @RecordId        NVARCHAR(20),
    @WorkspaceId     UNIQUEIDENTIFIER,
    @Name            NVARCHAR(400),
    @Description     NVARCHAR(MAX),
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
    DECLARE @DescLocal     NVARCHAR(MAX)    = @Description;
    DECLARE @FieldsLocal   NVARCHAR(MAX)    = ISNULL(@FieldValuesJson, N'{}');
    DECLARE @IfMatch       VARBINARY(8)     = @IfMatchRowVer;
    DECLARE @Actor         NVARCHAR(256)    = @ActorUserId;
    DECLARE @CurrentRowVer VARBINARY(8);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @CurrentRowVer = RowVer
        FROM dbo.Requests WITH (UPDLOCK, ROWLOCK)
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        IF @CurrentRowVer IS NULL
            THROW 50043, N'usp_PatchRequest: request not found.', 1;

        IF @IfMatch IS NULL OR @CurrentRowVer <> @IfMatch
            THROW 50040, N'usp_PatchRequest: the record was modified by someone else (stale ETag).', 1;

        -- Keep the field map's mirrored name in sync with the promoted column.
        SET @FieldsLocal = JSON_MODIFY(@FieldsLocal, N'$.name', @NameLocal);

        UPDATE dbo.Requests
        SET Name        = @NameLocal,
            Description  = @DescLocal,
            FieldValues  = @FieldsLocal,
            UpdatedBy    = @Actor,
            UpdatedAt    = SYSUTCDATETIME()
        WHERE RecordId = @RecordIdLocal AND WorkspaceId = @Ws AND IsDeleted = 0;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
