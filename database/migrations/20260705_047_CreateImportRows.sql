-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Creates dbo.ImportRows — the per-row validation report for one import (BS §13, S28).
--              One row per CSV data row. Outcome is 'Landed' (a Request was created — RecordId set)
--              or 'Flagged' (a hard validation failure — no record created). ReasonsJson holds the
--              `[{ code, message, field }]` array: hard failures on Flagged rows AND soft
--              Requestor-fallback warnings on Landed rows (a fallback row lands but is still
--              surfaced in the report, never silent — BS §13). RecordId has no hard FK (it is minted
--              from usp_MintRecordId and may be NULL for a flagged row), matching AuditEntry /
--              Attachments. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ImportRows', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ImportRows
    (
        ImportRowId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ImportRows_ImportRowId DEFAULT NEWSEQUENTIALID(),
        ImportId    UNIQUEIDENTIFIER NOT NULL,
        -- 1-based index into the CSV data rows (header excluded), for the report table.
        RowIndex    INT              NOT NULL,
        Outcome     NVARCHAR(16)     NOT NULL,
        -- Set when a record was created (Landed). NULL on a Flagged (hard-failure) row.
        RecordId    NVARCHAR(20)     NULL,
        -- `[{ "code": "...", "message": "...", "field": "..." }]` — NULL when a Landed row has no warning.
        ReasonsJson NVARCHAR(MAX)    NULL,

        CreatedAt   DATETIME2        NOT NULL CONSTRAINT DF_ImportRows_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt   DATETIME2        NOT NULL CONSTRAINT DF_ImportRows_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy   NVARCHAR(256)    NOT NULL,
        UpdatedBy   NVARCHAR(256)    NOT NULL,
        IsDeleted   BIT              NOT NULL CONSTRAINT DF_ImportRows_IsDeleted DEFAULT 0,
        DeletedAt   DATETIME2        NULL,

        CONSTRAINT PK_ImportRows PRIMARY KEY CLUSTERED (ImportRowId),
        CONSTRAINT FK_ImportRows_Imports FOREIGN KEY (ImportId)
            REFERENCES dbo.Imports (ImportId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_ImportRows_Outcome CHECK (Outcome IN (N'Landed', N'Flagged')),
        CONSTRAINT CK_ImportRows_ReasonsJson CHECK (ReasonsJson IS NULL OR ISJSON(ReasonsJson) = 1)
    );
END;
GO

-- FK index on ImportId, ordered by RowIndex — the report read enumerates a job's rows in order.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ImportRows_Import_RowIndex' AND object_id = OBJECT_ID(N'dbo.ImportRows'))
    CREATE NONCLUSTERED INDEX IX_ImportRows_Import_RowIndex
        ON dbo.ImportRows (ImportId, RowIndex) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_047_CreateImportRows')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_047_CreateImportRows', SUSER_SNAME(), N'Slice 16 — ImportRows per-row validation report.');
END;
GO
