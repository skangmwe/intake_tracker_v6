-- =============================================
-- Author:      /dev-build-application (Slice 9 — Escalation bridge)
-- Create Date: 2026-07-04
-- Description: Escalates a PG-side Request into the AI Solutions workspace (BS §6, the
--              single load-bearing bridge). One-time, one-way. In one transaction it:
--                1. resolves the single AI Solutions workspace + its default lifecycle's
--                   first (Intake) stage;
--                2. guards one-time/one-way — an AI-side row for this RecordId already
--                   existing throws 50044 (→ 409 already-escalated);
--                3. inserts the AI-side Requests row that ADOPTS the shared RecordId
--                   (shared canonical key, BS §6.1), Created-at = the escalation event
--                   (BS §10.6), Origin resolved from the shared prefix (same on both
--                   sides), Stage = Intake;
--                4. snapshots + locks the PG-side crossing fields into
--                   RequestCrossingSnapshot (the snapshot's presence is the PG-side lock
--                   signal read by the PATCH guard + the bridge read).
--
--              @AiFieldValuesJson and @SnapshotJson are assembled API-side from the PG
--              record's values + the crossing map (FieldDefinition Category='Crossing');
--              the proc only persists them. Each snapshot value is the raw JSON text of
--              the crossing field's escalation-time value (a JSON string in the array so
--              scalars, arrays, and objects all round-trip). Audit + mirror + AI-Intake
--              notification flow from the API's escalation.opened event, not here.
--              Idempotent object creation via CREATE OR ALTER.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_EscalateRequest
    @RecordId          NVARCHAR(20),
    @PgWorkspaceId     UNIQUEIDENTIFIER,
    @Name              NVARCHAR(400),
    @Description       NVARCHAR(MAX),
    @AiFieldValuesJson NVARCHAR(MAX),
    @SnapshotJson      NVARCHAR(MAX),
    @ActorUserId       NVARCHAR(256),
    @AiWorkspaceId     UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Rec        NVARCHAR(20)     = @RecordId;
    DECLARE @PgWs       UNIQUEIDENTIFIER = @PgWorkspaceId;
    DECLARE @NameLocal  NVARCHAR(400)    = @Name;
    DECLARE @DescLocal  NVARCHAR(MAX)    = @Description;
    DECLARE @AiFields   NVARCHAR(MAX)    = ISNULL(@AiFieldValuesJson, N'{}');
    DECLARE @Snapshots  NVARCHAR(MAX)    = ISNULL(@SnapshotJson, N'[]');
    DECLARE @Actor      NVARCHAR(256)    = @ActorUserId;

    DECLARE @AiWs       UNIQUEIDENTIFIER;
    DECLARE @Lifecycle  UNIQUEIDENTIFIER;
    DECLARE @Stage      NVARCHAR(64);
    DECLARE @Origin     NVARCHAR(200);
    DECLARE @OriginWs   UNIQUEIDENTIFIER;

    SET @AiWorkspaceId = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- The single central AI Solutions workspace is the escalation target.
        SELECT @AiWs = WorkspaceId
        FROM dbo.Workspaces
        WHERE Kind = N'ai-solutions' AND IsDeleted = 0;

        IF @AiWs IS NULL
            THROW 50045, 'No AI Solutions workspace is configured.', 1;

        -- An AI Solutions record has no PG origin — it cannot be escalated.
        IF @PgWs = @AiWs
            THROW 50046, 'An AI Solutions record cannot be escalated.', 1;

        -- One-time, one-way (BS §6.6): reject a second escalation of the same record.
        IF EXISTS (SELECT 1 FROM dbo.Requests
                   WHERE RecordId = @Rec AND WorkspaceId = @AiWs AND IsDeleted = 0)
            THROW 50044, 'This record has already been escalated.', 1;

        -- The AI-side record lands on the AI default lifecycle's first (Intake) stage,
        -- so escalated and AI-direct records share one intake code path (BS §6.1).
        SELECT @Lifecycle = LifecycleId
        FROM dbo.Lifecycle
        WHERE WorkspaceId = @AiWs AND IsDefault = 1 AND IsDeleted = 0;

        IF @Lifecycle IS NULL
            SELECT TOP 1 @Lifecycle = LifecycleId
            FROM dbo.Lifecycle
            WHERE WorkspaceId = @AiWs AND IsDeleted = 0
            ORDER BY SortOrder;

        IF @Lifecycle IS NULL
            THROW 50047, 'The AI Solutions workspace has no lifecycle configured.', 1;

        SELECT TOP 1 @Stage = StageKey
        FROM dbo.StageDefinition
        WHERE LifecycleId = @Lifecycle AND IsDeleted = 0
        ORDER BY SortOrder;

        IF @Stage IS NULL
            THROW 50047, 'The AI Solutions lifecycle has no stages configured.', 1;

        -- Origin resolves from the shared RecordId's prefix (the PG prefix), so the AI-side
        -- row names the same originating workspace as the PG-side row (BS §6.2).
        EXEC dbo.usp_ResolveOrigin @RecordId = @Rec,
             @WorkspaceId = @OriginWs OUTPUT, @WorkspaceNameAtMint = @Origin OUTPUT;

        -- Mirror stage + name into the AI field map (parity with usp_CreateRequest) so the
        -- condition engine derives Display/Mirror Status on the AI side.
        SET @AiFields = JSON_MODIFY(JSON_MODIFY(@AiFields, N'$.stage', @Stage), N'$.name', @NameLocal);

        -- Insert the AI-side row: adopt the shared RecordId; Created-at = escalation event.
        INSERT INTO dbo.Requests
            (RecordId, WorkspaceId, LifecycleId, Origin, Name, Description, Stage, Submitted,
             FieldValues, CreatedBy, UpdatedBy)
        VALUES
            (@Rec, @AiWs, @Lifecycle, @Origin, @NameLocal, @DescLocal, @Stage, SYSUTCDATETIME(),
             @AiFields, @Actor, @Actor);

        -- Snapshot + lock the PG-side crossing fields. SnapshotValue is the raw JSON text of
        -- the escalation-time value; the outer array carries it as a JSON string so scalars,
        -- arrays, and objects all round-trip. Forward-only: a field added to the crossing set
        -- after this point never retroactively locks on this already-escalated record.
        INSERT INTO dbo.RequestCrossingSnapshot
            (RecordId, WorkspaceId, FieldKey, SnapshotValue, LockedAtEscalation, CreatedBy, UpdatedBy)
        SELECT @Rec, @PgWs, snap.FieldKey, snap.SnapshotValue, 1, @Actor, @Actor
        FROM OPENJSON(@Snapshots)
             WITH (FieldKey NVARCHAR(64) N'$.fieldKey', SnapshotValue NVARCHAR(MAX) N'$.value') AS snap;

        -- Attachments follow the record across the bridge (BS §6.3) — they are NOT governed by the
        -- crossing map. Duplicate each live PG-side attachment as a new AI-side row that shares the
        -- original BlobPath, so both sides point at the same stored bytes (SQL is the source of truth
        -- for the pointer; no blob copy). Native uploads and external links both carry across. The
        -- Attachments table (slice 11) always exists before this proc runs — migrations precede
        -- procedures, and deferred name resolution keeps this safe even if an environment lags.
        INSERT INTO dbo.Attachments
            (AttachmentId, RecordId, ObjectType, WorkspaceId, FileName, ContentType, SizeBytes,
             BlobPath, IsLink, ExternalUrl, CreatedBy, UpdatedBy)
        SELECT NEWID(), a.RecordId, a.ObjectType, @AiWs, a.FileName, a.ContentType, a.SizeBytes,
               a.BlobPath, a.IsLink, a.ExternalUrl, @Actor, @Actor
        FROM dbo.Attachments AS a
        WHERE a.RecordId = @Rec
          AND a.WorkspaceId = @PgWs
          AND a.IsDeleted = 0;

        SET @AiWorkspaceId = @AiWs;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
