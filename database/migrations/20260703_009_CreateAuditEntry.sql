-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Creates dbo.AuditEntry — append-only, immutable audit trail captured
--              off the event spine (BS §12, data-model.md). An INSTEAD OF
--              UPDATE, DELETE trigger rejects every mutation at every access level,
--              including a soft-delete. Only INSERT is permitted. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.AuditEntry', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditEntry
    (
        AuditId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_AuditEntry_AuditId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId   UNIQUEIDENTIFIER NOT NULL,
        -- Null for workspace-level or config events.
        RecordId      NVARCHAR(20)     NULL,
        ObjectType    NVARCHAR(16)     NULL,
        EventType     NVARCHAR(64)     NOT NULL,
        -- Null for system-generated events.
        ActorUserId   UNIQUEIDENTIFIER NULL,
        EventAt       DATETIME2        NOT NULL CONSTRAINT DF_AuditEntry_EventAt DEFAULT SYSUTCDATETIME(),
        -- Structured JSON payload. Sanitised of raw PII per api-pii-handling.md.
        EventPayload  NVARCHAR(MAX)    NOT NULL,

        -- Audit columns kept for schema consistency; UPDATE/DELETE (incl. soft-delete)
        -- are rejected by trg_AuditEntry_PreventMutation, so these never change post-insert.
        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_AuditEntry_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt     DATETIME2        NOT NULL CONSTRAINT DF_AuditEntry_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,
        IsDeleted     BIT              NOT NULL CONSTRAINT DF_AuditEntry_IsDeleted DEFAULT 0,
        DeletedAt     DATETIME2        NULL,

        CONSTRAINT PK_AuditEntry PRIMARY KEY CLUSTERED (AuditId),
        CONSTRAINT FK_AuditEntry_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_AuditEntry_Users FOREIGN KEY (ActorUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- FK indexes.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditEntry_ActorUserId' AND object_id = OBJECT_ID(N'dbo.AuditEntry'))
    CREATE NONCLUSTERED INDEX IX_AuditEntry_ActorUserId ON dbo.AuditEntry (ActorUserId);
GO

-- Audit-log query surface: workspace timeline filtered by event type (BS §12 / slice 18).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditEntry_Workspace_EventAt_EventType' AND object_id = OBJECT_ID(N'dbo.AuditEntry'))
    CREATE NONCLUSTERED INDEX IX_AuditEntry_Workspace_EventAt_EventType
        ON dbo.AuditEntry (WorkspaceId, EventAt DESC, EventType);
GO

-- Per-record activity thread (BS §9.3 / slice 6).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditEntry_Record_EventAt' AND object_id = OBJECT_ID(N'dbo.AuditEntry'))
    CREATE NONCLUSTERED INDEX IX_AuditEntry_Record_EventAt
        ON dbo.AuditEntry (RecordId, EventAt DESC) WHERE RecordId IS NOT NULL;
GO

-- Append-only enforcement: reject every UPDATE and DELETE, at every access level.
IF OBJECT_ID(N'dbo.trg_AuditEntry_PreventMutation', N'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_AuditEntry_PreventMutation;
GO
CREATE TRIGGER dbo.trg_AuditEntry_PreventMutation
ON dbo.AuditEntry
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- No row is ever changed. The audit trail is immutable (BS §12).
    THROW 50000, N'dbo.AuditEntry is append-only. UPDATE and DELETE are not permitted.', 1;
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_009_CreateAuditEntry')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_009_CreateAuditEntry', SUSER_SNAME(), N'Slice 1 — AuditEntry table + append-only trigger.');
END;
GO
