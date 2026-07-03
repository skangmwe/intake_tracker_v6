-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Appends one immutable row to dbo.AuditEntry (BS §12). The only write
--              path into the audit trail — UPDATE/DELETE are rejected by the table's
--              INSTEAD OF trigger. Payload must already be sanitised of raw PII by
--              the caller (api-pii-handling.md). ActorUserId is NULL for
--              system-generated events; CreatedBy/UpdatedBy record the actor's oid
--              (or 'system' when null) — never a display name (api-logging.md).
--
--              No explicit transaction: a single INSERT, designed to run inside the
--              caller's transaction so the audit row commits atomically with the
--              state change it records. SET XACT_ABORT ON propagates any error.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_EmitAuditEntry
    @WorkspaceId  UNIQUEIDENTIFIER,
    @EventType    NVARCHAR(64),
    @EventPayload NVARCHAR(MAX),
    @RecordId     NVARCHAR(20)     = NULL,
    @ObjectType   NVARCHAR(16)     = NULL,
    @ActorUserId  UNIQUEIDENTIFIER = NULL,
    @EventAt      DATETIME2        = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Copy parameters into locals (parameter-sniffing mitigation).
    DECLARE @WorkspaceIdLocal UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @EventTypeLocal   NVARCHAR(64)     = @EventType;
    DECLARE @PayloadLocal     NVARCHAR(MAX)    = @EventPayload;
    DECLARE @RecordIdLocal    NVARCHAR(20)     = @RecordId;
    DECLARE @ObjectTypeLocal  NVARCHAR(16)     = @ObjectType;
    DECLARE @ActorLocal       UNIQUEIDENTIFIER = @ActorUserId;
    DECLARE @EventAtLocal     DATETIME2        = ISNULL(@EventAt, SYSUTCDATETIME());
    DECLARE @Actor            NVARCHAR(256)    = ISNULL(CONVERT(NVARCHAR(36), @ActorUserId), N'system');

    INSERT INTO dbo.AuditEntry
        (WorkspaceId, RecordId, ObjectType, EventType, ActorUserId, EventAt, EventPayload, CreatedBy, UpdatedBy)
    VALUES
        (@WorkspaceIdLocal, @RecordIdLocal, @ObjectTypeLocal, @EventTypeLocal, @ActorLocal, @EventAtLocal, @PayloadLocal, @Actor, @Actor);
END;
GO
