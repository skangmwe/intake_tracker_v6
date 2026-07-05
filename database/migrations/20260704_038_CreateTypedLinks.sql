-- =============================================
-- Author:      /dev-build-application (Slice 10 — Closure, Copy, Re-pursuit + Typed links)
-- Create Date: 2026-07-04
-- Description: Creates dbo.TypedLinks — record-to-record references (BS §2.2, data-model.md
--              §TypedLink). Reference only: never a bridge, never a computation input. Link
--              kinds: related / duplicate-of / re-pursuit-of / sourced-from.
--
--              Like Comments / AuditEntry, FromRecordId / ToRecordId carry NO hard FK to
--              Requests — the object type is inferred from the id, and an escalated record's
--              shared canonical id is intentionally not unique across the two rows, so a
--              composite FK cannot apply. Access is gated at the API (the caller must see the
--              FROM record) and the far side is resolved access-respectingly at read time.
--
--              Delete is soft (audit-preserved). Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.TypedLinks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TypedLinks
    (
        LinkId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TypedLinks_LinkId DEFAULT NEWSEQUENTIALID(),
        FromRecordId NVARCHAR(20)     NOT NULL,
        ToRecordId   NVARCHAR(20)     NOT NULL,
        -- related | duplicate-of | re-pursuit-of | sourced-from (BS §2.2).
        LinkKind     NVARCHAR(32)     NOT NULL,
        Rationale    NVARCHAR(MAX)    NULL,

        CreatedAt    DATETIME2        NOT NULL CONSTRAINT DF_TypedLinks_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2        NOT NULL CONSTRAINT DF_TypedLinks_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy    NVARCHAR(256)    NOT NULL,
        UpdatedBy    NVARCHAR(256)    NOT NULL,
        IsDeleted    BIT              NOT NULL CONSTRAINT DF_TypedLinks_IsDeleted DEFAULT 0,
        DeletedAt    DATETIME2        NULL,

        CONSTRAINT PK_TypedLinks PRIMARY KEY CLUSTERED (LinkId),
        CONSTRAINT CK_TypedLinks_LinkKind CHECK
            (LinkKind IN (N'related', N'duplicate-of', N're-pursuit-of', N'sourced-from')),
        -- A record never links to itself.
        CONSTRAINT CK_TypedLinks_NotSelf CHECK (FromRecordId <> ToRecordId)
    );
END;
GO

-- Outgoing links for a record's Relationships card (the hot read path).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TypedLinks_FromRecordId' AND object_id = OBJECT_ID(N'dbo.TypedLinks'))
    CREATE NONCLUSTERED INDEX IX_TypedLinks_FromRecordId
        ON dbo.TypedLinks (FromRecordId) WHERE IsDeleted = 0;
GO

-- Incoming lookups (e.g. "what points at this record").
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TypedLinks_ToRecordId' AND object_id = OBJECT_ID(N'dbo.TypedLinks'))
    CREATE NONCLUSTERED INDEX IX_TypedLinks_ToRecordId
        ON dbo.TypedLinks (ToRecordId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_038_CreateTypedLinks')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_038_CreateTypedLinks', SUSER_SNAME(), N'Slice 10 — TypedLinks table (record-to-record references).');
END;
GO
