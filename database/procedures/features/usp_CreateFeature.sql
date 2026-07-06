-- =============================================
-- Author:      /dev-build-application (Slice 14 — Feature Catalog + Saved-view editor)
-- Create Date: 2026-07-05
-- Description: Creates a Feature Catalog record (BS §2.5 / §18). Mints the record ID under the
--              AI Solutions workspace's counter (usp_MintRecordId) and inserts one row, inside a
--              single transaction so a failed insert never burns a sequence number. Origin is
--              resolved from the minted prefix (usp_ResolveOrigin). Name + Maturity are mirrored
--              into FieldValues so saved views / the condition engine read one map. Maturity always
--              starts Draft (BS §18.5). Returns the new RecordId via OUTPUT (no result set — the
--              caller re-reads via usp_GetFeatureByIdForUser).
--
--              @FieldValuesJson is the content-field map already validated + assembled by the API
--              (BS §18). Audit is emitted API-side off the event spine (feature.created).
--
--              @QueuedLinksJson (optional) is a `[{ "toRecordId": "...", "kind": "sourced-from" }]`
--              array carried from an Add-to-catalog draft (BS §5). Each is stamped as a typed link
--              FROM the newly-minted feature TO the source Request inside the same transaction.
--              Best-effort: a link whose target Request does not exist is silently skipped — a
--              queued link never fails the create (mirrors usp_CreateRequest).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateFeature
    @WorkspaceId     UNIQUEIDENTIFIER,   -- always the AI Solutions workspace (resolved API-side)
    @Name            NVARCHAR(400),
    @FieldValuesJson NVARCHAR(MAX),
    @ActorUserId     NVARCHAR(256),
    @RecordId        NVARCHAR(20) OUTPUT,
    @QueuedLinksJson NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws          UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @NameLocal   NVARCHAR(400)    = @Name;
    DECLARE @FieldsLocal NVARCHAR(MAX)    = ISNULL(@FieldValuesJson, N'{}');
    DECLARE @Actor       NVARCHAR(256)    = @ActorUserId;
    DECLARE @Origin      NVARCHAR(200);
    DECLARE @OriginWs    UNIQUEIDENTIFIER;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Mint inside the transaction so a failed insert rolls the counter back.
        EXEC dbo.usp_MintRecordId @WorkspaceId = @Ws, @RecordId = @RecordId OUTPUT;

        -- Origin = the minting workspace's name at mint time (resolved from the prefix).
        EXEC dbo.usp_ResolveOrigin @RecordId = @RecordId,
             @WorkspaceId = @OriginWs OUTPUT, @WorkspaceNameAtMint = @Origin OUTPUT;

        -- Mirror name + maturity into the field map so saved views / condition engine see them.
        SET @FieldsLocal = JSON_MODIFY(JSON_MODIFY(@FieldsLocal, N'$.name', @NameLocal), N'$.maturity', N'Draft');

        INSERT INTO dbo.Features
            (RecordId, WorkspaceId, Origin, Name, Maturity, FieldValues, CreatedBy, UpdatedBy)
        VALUES
            (@RecordId, @Ws, @Origin, @NameLocal, N'Draft', @FieldsLocal, @Actor, @Actor);

        -- Stamp any queued link-backs (Add-to-catalog `sourced-from`). Best-effort: only targets
        -- that exist as a Request and pass the CHECK constraints are stamped; the rest are skipped.
        IF @QueuedLinksJson IS NOT NULL AND ISJSON(@QueuedLinksJson) = 1
        BEGIN
            INSERT INTO dbo.TypedLinks (LinkId, FromRecordId, ToRecordId, LinkKind, CreatedBy, UpdatedBy)
            SELECT NEWID(), @RecordId, q.ToRecordId, ISNULL(NULLIF(q.Kind, N''), N'sourced-from'), @Actor, @Actor
            FROM OPENJSON(@QueuedLinksJson)
                WITH (ToRecordId NVARCHAR(20) N'$.toRecordId', Kind NVARCHAR(32) N'$.kind') AS q
            WHERE q.ToRecordId IS NOT NULL
              AND q.ToRecordId <> @RecordId
              AND ISNULL(NULLIF(q.Kind, N''), N'sourced-from') IN (N'related', N'duplicate-of', N're-pursuit-of', N'sourced-from')
              AND EXISTS (SELECT 1 FROM dbo.Requests WHERE RecordId = q.ToRecordId AND IsDeleted = 0);
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
