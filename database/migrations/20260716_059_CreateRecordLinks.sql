-- =============================================
-- Author:      /dev-build-application (Slice 25 — Relationships side panel)
-- Create Date: 2026-07-16
-- Description: Creates dbo.RecordLinks — the row-level linkage table backing
--              POST /api/v1/records/{recordId}/links (v2-reconciliation.md
--              §API deltas Relationships records-side "link a record" API).
--
--              Independent of dbo.TypedLinks (Slice 10 — 'related' / 'duplicate-of' /
--              're-pursuit-of' / 'sourced-from' hardcoded kinds). RecordLinks rows are
--              instances of a Relationship definition (RelationshipId FK), so the
--              relationship schema (from/to object, cardinality, side labels) drives
--              rendering rather than a hardcoded kind. TypedLinks stays for the
--              slice-10 side-panel affordance; RecordLinks powers the S30-defined
--              per-object Relationships side panel and the config-driven tab bar.
--
--              WorkspaceId is stored per-side (like Watcher / Comment / AuditEntry) so
--              an escalated record's two shared-RecordId rows keep their link rosters
--              distinct — a link on the PG side isn't automatically visible on the AI
--              side. Access-gating is the caller's membership of WorkspaceId; the read
--              proc filters accordingly. Soft-deleted by default (retire semantics per
--              database-coding-standards.md).
--
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.RecordLinks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RecordLinks
    (
        RecordLinkId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RecordLinks_RecordLinkId DEFAULT NEWSEQUENTIALID(),
        RelationshipId     UNIQUEIDENTIFIER NOT NULL,
        WorkspaceId        UNIQUEIDENTIFIER NOT NULL,
        -- Composite record IDs: both sides carry PREFIX-NNNNNNNN strings. A link is
        -- FROM one record TO another (direction matters for rendering as From→To vs
        -- To←From labels; both sides visible via usp_ListRecordLinks).
        FromRecordId       NVARCHAR(20)     NOT NULL,
        ToRecordId         NVARCHAR(20)     NOT NULL,

        CreatedAt          DATETIME2        NOT NULL CONSTRAINT DF_RecordLinks_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt          DATETIME2        NOT NULL CONSTRAINT DF_RecordLinks_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy          NVARCHAR(256)    NOT NULL,
        UpdatedBy          NVARCHAR(256)    NOT NULL,
        IsDeleted          BIT              NOT NULL CONSTRAINT DF_RecordLinks_IsDeleted DEFAULT 0,
        DeletedAt          DATETIME2        NULL,

        CONSTRAINT PK_RecordLinks PRIMARY KEY CLUSTERED (RecordLinkId),
        CONSTRAINT FK_RecordLinks_Relationship FOREIGN KEY (RelationshipId)
            REFERENCES dbo.Relationships (RelationshipId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_RecordLinks_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        -- A link references two distinct records — self-links are never useful.
        CONSTRAINT CK_RecordLinks_DistinctRecords CHECK (FromRecordId <> ToRecordId)
    );
END;
GO

-- FK indexes (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RecordLinks_RelationshipId' AND object_id = OBJECT_ID(N'dbo.RecordLinks'))
    CREATE NONCLUSTERED INDEX IX_RecordLinks_RelationshipId
        ON dbo.RecordLinks (RelationshipId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RecordLinks_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.RecordLinks'))
    CREATE NONCLUSTERED INDEX IX_RecordLinks_WorkspaceId ON dbo.RecordLinks (WorkspaceId);
GO

-- From-side list read (S4/S5 Relationships side panel + relationship-driven tab):
-- "give me every link where I am the From record, grouped by relationship".
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RecordLinks_FromRecord' AND object_id = OBJECT_ID(N'dbo.RecordLinks'))
    CREATE NONCLUSTERED INDEX IX_RecordLinks_FromRecord
        ON dbo.RecordLinks (WorkspaceId, FromRecordId, RelationshipId)
        INCLUDE (ToRecordId, CreatedAt, CreatedBy)
        WHERE IsDeleted = 0;
GO

-- To-side (reverse) read — surfaces the record on its target's panel too.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RecordLinks_ToRecord' AND object_id = OBJECT_ID(N'dbo.RecordLinks'))
    CREATE NONCLUSTERED INDEX IX_RecordLinks_ToRecord
        ON dbo.RecordLinks (WorkspaceId, ToRecordId, RelationshipId)
        INCLUDE (FromRecordId, CreatedAt, CreatedBy)
        WHERE IsDeleted = 0;
GO

-- Dedup: at most one active link row per (relationship, from, to). A soft-deleted link
-- is not counted so re-linking after removal creates a fresh row.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RecordLinks_RelFromTo' AND object_id = OBJECT_ID(N'dbo.RecordLinks'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_RecordLinks_RelFromTo
        ON dbo.RecordLinks (RelationshipId, FromRecordId, ToRecordId)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260716_059_CreateRecordLinks')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260716_059_CreateRecordLinks', SUSER_SNAME(),
            N'Slice 25 — RecordLinks table (row-level relationship instances for the side panel + relationship-driven tabs).');
END;
GO
