-- =============================================
-- Author:      /dev-build-application (Slice 25 — Relationships side panel)
-- Create Date: 2026-07-16
-- Description: Creates a link row instance of a Relationship
--              (v2-reconciliation.md §API deltas Relationships POST /records/{recordId}/links).
--              Idempotent: if an active link already exists for
--              (RelationshipId, FromRecordId, ToRecordId), returns the existing id
--              without duplicating.
--
--              Access-gating (Viewer+ on the record's WorkspaceId) is enforced at the
--              controller. The relationship must be non-retired — retired Relationships
--              still hold historical rows but new links are blocked (50063
--              relationship-retired-blocks-link).
--
--              Cardinality guard: for OneToOne, the From record must not already have
--              an active link on this relationship (50061 relationship-inconsistent-
--              cardinality). OneToMany allows many children per parent — no From-side
--              guard. ManyToMany allows any pair.
--
--              Error contract:
--                50060 → relationship not found or not in this workspace.
--                50061 → cardinality violation (OneToOne link already exists on From).
--                50063 → relationship is retired.
--                50067 → v2 review F-3 (A01 IDOR): a supplied RecordId does not exist
--                         in @WorkspaceId (or is soft-deleted). Prevents cross-workspace
--                         link pollution.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_UpsertRecordLink
    @RelationshipId  UNIQUEIDENTIFIER,
    @WorkspaceId     UNIQUEIDENTIFIER,
    @FromRecordId    NVARCHAR(20),
    @ToRecordId      NVARCHAR(20),
    @ActorUserId     NVARCHAR(256),
    @RecordLinkId    UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RelId  UNIQUEIDENTIFIER = @RelationshipId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @From   NVARCHAR(20)     = @FromRecordId;
    DECLARE @To     NVARCHAR(20)     = @ToRecordId;
    DECLARE @Actor  NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now    DATETIME2        = SYSUTCDATETIME();
    DECLARE @LinkId UNIQUEIDENTIFIER = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Card NVARCHAR(20), @IsRetired BIT;
        SELECT @Card = Cardinality, @IsRetired = IsRetired
        FROM   dbo.Relationships
        WHERE  RelationshipId = @RelId AND WorkspaceId = @Ws AND IsDeleted = 0;

        IF @Card IS NULL
            THROW 50060, 'Relationship not found in this workspace.', 1;

        IF @IsRetired = 1
            THROW 50063, 'Relationship is retired; new links are blocked.', 1;

        -- v2 review F-3 (A01 IDOR): both endpoints must reference records that exist
        -- in this workspace. Without this guard, a caller can create a link from any
        -- FromRecordId / ToRecordId string, polluting the workspace's link space with
        -- references to foreign-workspace or nonexistent records. Requests is the only
        -- record-bearing object in R1; Task/Feature/Announcement/ToolkitItem have their
        -- own tables but are not first-class link targets today. When they become
        -- link targets, extend this check.
        IF NOT EXISTS (
            SELECT 1 FROM dbo.Requests
             WHERE RecordId = @From AND WorkspaceId = @Ws AND IsDeleted = 0
        )
            THROW 50067, 'From record is not in this workspace.', 1;
        IF NOT EXISTS (
            SELECT 1 FROM dbo.Requests
             WHERE RecordId = @To AND WorkspaceId = @Ws AND IsDeleted = 0
        )
            THROW 50067, 'To record is not in this workspace.', 1;

        -- Idempotency: return existing active link if the (relationship, from, to)
        -- triple already resolves.
        SELECT @LinkId = RecordLinkId
        FROM   dbo.RecordLinks
        WHERE  RelationshipId = @RelId
          AND  FromRecordId   = @From
          AND  ToRecordId     = @To
          AND  IsDeleted      = 0;

        IF @LinkId IS NOT NULL
        BEGIN
            COMMIT TRANSACTION;
            SET @RecordLinkId = @LinkId;
            RETURN;
        END

        -- Cardinality guard (OneToOne). OneToMany and ManyToMany accept many rows.
        IF @Card = N'OneToOne'
        BEGIN
            IF EXISTS (
                SELECT 1 FROM dbo.RecordLinks
                 WHERE RelationshipId = @RelId AND FromRecordId = @From AND IsDeleted = 0
            )
                THROW 50061, 'OneToOne relationship already has an active link from this record.', 1;
        END

        SET @LinkId = NEWID();

        INSERT INTO dbo.RecordLinks
            (RecordLinkId, RelationshipId, WorkspaceId, FromRecordId, ToRecordId,
             CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)
        VALUES
            (@LinkId, @RelId, @Ws, @From, @To,
             @Now, @Now, @Actor, @Actor);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SET @RecordLinkId = @LinkId;
END;
GO
