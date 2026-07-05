-- =============================================
-- Author:      /dev-build-application (Slice 11 — Attachments)
-- Create Date: 2026-07-05
-- Description: Creates dbo.Attachments — files (and external links) that follow a record
--              (BS §2.3, data-model.md §Attachment). Files carry across the escalation bridge
--              regardless of the crossing map (BS §6.3): a PG-side attachment is duplicated as a
--              new AI-side row sharing the original BlobPath, so both sides point at the same
--              stored bytes (SQL is the source of truth for the pointer per api-blob-attachments.md).
--
--              WorkspaceId is stored per-side (like Watcher / AuditEntry / Comments) so the list
--              read access-gates by a WorkspaceMembership join and an escalated record's two
--              same-RecordId sides keep their own attachment rows. RecordId has no hard FK — the
--              object type is inferred (Requests today; Features later), matching AuditEntry.
--
--              Native uploads set BlobPath and leave ExternalUrl NULL; external links set IsLink=1
--              + ExternalUrl and store a synthetic BlobPath sentinel (never streamed). Deletes are
--              soft (IsDeleted); the blob is retained until a retention policy fires (out of scope).
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Attachments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Attachments
    (
        AttachmentId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Attachments_AttachmentId DEFAULT NEWSEQUENTIALID(),
        RecordId      NVARCHAR(20)     NOT NULL,
        ObjectType    NVARCHAR(16)     NOT NULL CONSTRAINT DF_Attachments_ObjectType DEFAULT N'Request',
        -- Per-side: an attachment lives on one workspace's copy of the record (bridge, slice 9).
        WorkspaceId   UNIQUEIDENTIFIER NOT NULL,
        FileName      NVARCHAR(400)    NOT NULL,
        ContentType   NVARCHAR(200)    NOT NULL,
        SizeBytes     BIGINT           NOT NULL CONSTRAINT DF_Attachments_SizeBytes DEFAULT 0,
        -- Opaque, server-allocated pointer: {workspaceId}/{recordId}/{attachmentId}/{fileName}.
        -- Access/identity is never derived from the path — SQL is the authority (api-blob-attachments.md).
        BlobPath      NVARCHAR(1024)   NOT NULL,
        IsLink        BIT              NOT NULL CONSTRAINT DF_Attachments_IsLink DEFAULT 0,
        ExternalUrl   NVARCHAR(2048)   NULL,

        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Attachments_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Attachments_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,
        IsDeleted     BIT              NOT NULL CONSTRAINT DF_Attachments_IsDeleted DEFAULT 0,
        DeletedAt     DATETIME2        NULL,

        CONSTRAINT PK_Attachments PRIMARY KEY CLUSTERED (AttachmentId),
        CONSTRAINT FK_Attachments_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        -- An external link carries a URL; a native upload does not. Enforce the pairing.
        CONSTRAINT CK_Attachments_LinkUrl CHECK (
            (IsLink = 1 AND ExternalUrl IS NOT NULL)
            OR (IsLink = 0 AND ExternalUrl IS NULL))
    );
END;
GO

-- FK index on WorkspaceId (database-performance.md — every FK column has a non-clustered index;
-- also drives the access gate on the list read).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Attachments_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Attachments'))
    CREATE NONCLUSTERED INDEX IX_Attachments_WorkspaceId ON dbo.Attachments (WorkspaceId) WHERE IsDeleted = 0;
GO

-- Per-record list read: attachments for a record on one side, newest first.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Attachments_Record_Workspace_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Attachments'))
    CREATE NONCLUSTERED INDEX IX_Attachments_Record_Workspace_CreatedAt
        ON dbo.Attachments (RecordId, WorkspaceId, CreatedAt) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_039_CreateAttachments')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_039_CreateAttachments', SUSER_SNAME(), N'Slice 11 — Attachments table (files follow the record).');
END;
GO
