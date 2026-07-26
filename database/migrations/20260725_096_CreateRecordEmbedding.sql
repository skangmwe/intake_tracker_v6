-- =============================================
-- Author:      /dev-build-application (AI-assist layer — Phase 4, Slice 2 retrieval)
-- Create Date: 2026-07-25
-- Description: Creates dbo.RecordEmbedding — the per-record semantic vector store for the AI-assist
--              search retriever (BS §14). One row per (ObjectType, RecordId): the float32 embedding
--              of the record's allowlisted content, plus the SHA-256 hash of the exact content that
--              was embedded so the daily refresh sweep re-embeds only when the content changed.
--                • Vector        — the embedding as a flat little-endian float32 blob (EmbeddingBytes).
--                • ContentHash   — SHA2_256 hex of the concatenated allowlisted content that was embedded.
--                • Model / Dimensions — the embedding model + dims at write time (text-embedding-3-large / 3072),
--                                  recorded so a future model/dim change is detectable and re-embeddable.
--              ObjectType is 'Request' this cycle. Uniqueness is per (WorkspaceId, ObjectType, RecordId), NOT
--              (ObjectType, RecordId): a Request's RecordId is only unique WITHIN a workspace — escalation
--              creates a second row with the SAME RecordId on the AI Solutions workspace (Requests PK is the
--              pair (WorkspaceId, RecordId)), and the two sides carry per-side content, so each side owns its
--              own vector. Vectors carry no PII on their own, but the store still gets the six audit columns +
--              soft-delete like every table (database-coding-standards.md). Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.RecordEmbedding', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RecordEmbedding
    (
        EmbeddingId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RecordEmbedding_EmbeddingId DEFAULT NEWID(),
        WorkspaceId   UNIQUEIDENTIFIER NOT NULL,
        -- The record's object type. 'Request' this cycle; widened as later objects join retrieval.
        ObjectType    NVARCHAR(64)     NOT NULL,
        -- The record's business id (e.g. a Request RecordId like 'LIT-9004'). NVARCHAR to match Requests.RecordId.
        RecordId      NVARCHAR(64)     NOT NULL,
        -- The embedding model + dimensionality at write time (text-embedding-3-large / 3072). A change to
        -- either signals every row must be re-embedded.
        Model         NVARCHAR(64)     NOT NULL,
        Dimensions    INT              NOT NULL,
        -- The embedding itself: a flat little-endian float32 blob (Dimensions * 4 bytes) — see EmbeddingBytes.
        Vector        VARBINARY(MAX)   NOT NULL,
        -- SHA-256 hex (uppercase, 64 chars) of the allowlisted content that produced Vector. ASCII-only, so VARCHAR/CHAR.
        ContentHash   CHAR(64)         NOT NULL,
        -- When the embedding was produced (IClock.UtcNow at upsert).
        EmbeddedAt    DATETIME2        NOT NULL,

        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_RecordEmbedding_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt     DATETIME2        NOT NULL CONSTRAINT DF_RecordEmbedding_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,
        IsDeleted     BIT              NOT NULL CONSTRAINT DF_RecordEmbedding_IsDeleted DEFAULT 0,
        DeletedAt     DATETIME2        NULL,

        CONSTRAINT PK_RecordEmbedding PRIMARY KEY CLUSTERED (EmbeddingId),
        CONSTRAINT FK_RecordEmbedding_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- One live embedding per (WorkspaceId, ObjectType, RecordId) — the unique key the upsert MERGE targets, and
-- every retrieval/refresh join. Filtered on IsDeleted = 0 so a soft-deleted row does not block re-creating an
-- embedding for the same record. WorkspaceId leads, so this index also serves as the FK index for WorkspaceId
-- (database-performance.md — no separate single-column FK index is added, to avoid a redundant index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RecordEmbedding_Ws_Object_Record' AND object_id = OBJECT_ID(N'dbo.RecordEmbedding'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_RecordEmbedding_Ws_Object_Record
        ON dbo.RecordEmbedding (WorkspaceId, ObjectType, RecordId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260725_096_CreateRecordEmbedding')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260725_096_CreateRecordEmbedding', SUSER_SNAME(), N'Phase 4 Slice 2 — per-record embedding store for AI-assist retrieval.');
END;
GO
