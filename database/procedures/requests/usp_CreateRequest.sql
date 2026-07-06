-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Creates a Request. Mints the record ID under the workspace's counter
--              (usp_MintRecordId) and inserts one row, all inside a single transaction so a
--              failed insert never burns a sequence number. Origin is resolved from the minted
--              prefix (usp_ResolveOrigin) so it stays correct for escalated/historical records.
--              Stage + Name are mirrored into FieldValues so the condition engine can derive
--              Display/Mirror Status. Returns the new RecordId via OUTPUT (no result set —
--              the caller re-reads the full row via usp_GetRequestByIdForUser).
--
--              @FieldValuesJson is the content-field map already validated + assembled by the
--              API (BS §17). Audit is emitted API-side off the event spine (request.created).
--
--              @QueuedLinksJson (slice 10, optional) is a `[{ "toRecordId": "...", "kind": "..." }]`
--              array of link-backs queued on the source draft by the similar-requests nudge (BS §9.8)
--              and by Copy / Promote (BS §5). Each is stamped as a typed link from the newly-minted
--              record inside the same transaction. Best-effort: a link whose target does not exist is
--              silently skipped — a queued link never fails the create.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CreateRequest
    @WorkspaceId     UNIQUEIDENTIFIER,
    @LifecycleId     UNIQUEIDENTIFIER,
    @Stage           NVARCHAR(64),
    @Name            NVARCHAR(400),
    @Description     NVARCHAR(MAX),
    @FieldValuesJson NVARCHAR(MAX),
    @ActorUserId     NVARCHAR(256),
    @RecordId        NVARCHAR(20) OUTPUT,
    @QueuedLinksJson NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ws          UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @Lifecycle   UNIQUEIDENTIFIER = @LifecycleId;
    DECLARE @StageLocal  NVARCHAR(64)     = @Stage;
    DECLARE @NameLocal   NVARCHAR(400)    = @Name;
    DECLARE @DescLocal   NVARCHAR(MAX)    = @Description;
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

        -- Mirror stage + name into the field map so the condition engine sees them.
        SET @FieldsLocal = JSON_MODIFY(JSON_MODIFY(@FieldsLocal, N'$.stage', @StageLocal), N'$.name', @NameLocal);

        INSERT INTO dbo.Requests
            (RecordId, WorkspaceId, LifecycleId, Origin, Name, Description, Stage, Submitted,
             StageEnteredAt, FieldValues, CreatedBy, UpdatedBy)
        VALUES
            (@RecordId, @Ws, @Lifecycle, @Origin, @NameLocal, @DescLocal, @StageLocal, SYSUTCDATETIME(),
             SYSUTCDATETIME(), @FieldsLocal, @Actor, @Actor);

        -- Stamp any queued link-backs (slice 10). Best-effort: only targets that exist as a Request
        -- and pass the CHECK constraints (kind allow-list, not-self) are stamped; the rest are
        -- skipped so a queued link never fails the create. Kinds default to 'related'.
        IF @QueuedLinksJson IS NOT NULL AND ISJSON(@QueuedLinksJson) = 1
        BEGIN
            INSERT INTO dbo.TypedLinks (LinkId, FromRecordId, ToRecordId, LinkKind, CreatedBy, UpdatedBy)
            SELECT NEWID(), @RecordId, q.ToRecordId, ISNULL(NULLIF(q.Kind, N''), N'related'), @Actor, @Actor
            FROM OPENJSON(@QueuedLinksJson)
                WITH (ToRecordId NVARCHAR(20) N'$.toRecordId', Kind NVARCHAR(32) N'$.kind') AS q
            WHERE q.ToRecordId IS NOT NULL
              AND q.ToRecordId <> @RecordId
              AND ISNULL(NULLIF(q.Kind, N''), N'related') IN (N'related', N'duplicate-of', N're-pursuit-of', N'sourced-from')
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
