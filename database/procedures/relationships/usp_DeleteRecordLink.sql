-- =============================================
-- Author:      /dev-build-application (Slice 25 — Relationships side panel)
-- Create Date: 2026-07-16
-- Description: Soft-deletes one RecordLink (v2-reconciliation.md §API deltas
--              Relationships DELETE /records/{recordId}/relationship-links/{linkId}).
--              Idempotent — a repeat call on an already-deleted link succeeds silently.
--
--              Access-gating (Member+ on the record's WorkspaceId) is enforced at the
--              controller.
--
--              v2 review F-2 (A01 path-scoping bypass): the {recordId} on the route MUST
--              match one endpoint of the link (FromRecordId OR ToRecordId). Without this
--              check, any workspace member can delete any link in the workspace by knowing
--              its linkId, regardless of which records the link connects. The proc raises
--              50068 when the link exists but its endpoints don't match @RecordId. When
--              the link is already deleted or genuinely absent, the UPDATE affects 0 rows
--              silently (idempotency).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_DeleteRecordLink
    @RecordLinkId UNIQUEIDENTIFIER,
    @WorkspaceId  UNIQUEIDENTIFIER,
    @RecordId     NVARCHAR(20),
    @ActorUserId  NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @LinkId UNIQUEIDENTIFIER = @RecordLinkId;
    DECLARE @Ws     UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @RecId  NVARCHAR(20)     = @RecordId;
    DECLARE @Actor  NVARCHAR(256)    = @ActorUserId;
    DECLARE @Now    DATETIME2        = SYSUTCDATETIME();

    -- Path-scope guard: verify the link exists AND that @RecordId is one of its endpoints.
    -- If the link is soft-deleted or genuinely absent, treat as idempotent (no-op).
    IF EXISTS (
        SELECT 1 FROM dbo.RecordLinks
         WHERE RecordLinkId = @LinkId
           AND WorkspaceId  = @Ws
           AND IsDeleted    = 0
           AND FromRecordId <> @RecId
           AND ToRecordId   <> @RecId
    )
        THROW 50068, 'The link does not belong to this record.', 1;

    UPDATE dbo.RecordLinks
       SET IsDeleted = 1,
           DeletedAt = @Now,
           UpdatedBy = @Actor,
           UpdatedAt = @Now
     WHERE RecordLinkId = @LinkId
       AND WorkspaceId  = @Ws
       AND IsDeleted    = 0
       AND (FromRecordId = @RecId OR ToRecordId = @RecId);
END;
GO
