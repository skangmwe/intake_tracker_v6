-- =============================================
-- Author:      /dev-build-application (Slice 16 — CSV Import & Export)
-- Create Date: 2026-07-05
-- Description: Creates dbo.Imports — the job-state row for one CSV import (BS §13, S28,
--              data-model.md / module-boundaries §18). Import is create-only: it never updates a
--              live record. One row per uploaded file; the per-row validation report lives in the
--              child dbo.ImportRows table (migration 047).
--
--              The uploaded CSV streams to Blob (LocalBlobStreamer in dev) and BlobPath points at
--              it; the in-process background processor reads it back to create Requests row-by-row.
--              Status walks Processing -> Completed | CompletedWithErrors | Failed. Counts
--              (TotalRows / LandedRows / FlaggedRows) are stamped by usp_CompleteImport. StartedBy
--              is the importing WorkspaceAdmin (also the Requestor fallback per BS §13). WorkspaceId
--              gates every read on a WorkspaceMembership admin join. Idempotent per
--              database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Imports', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Imports
    (
        ImportId        UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Imports_ImportId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId     UNIQUEIDENTIFIER NOT NULL,
        FileName        NVARCHAR(400)    NOT NULL,
        -- Opaque, server-allocated pointer to the stored CSV: imports/{workspaceId}/{importId}.csv.
        BlobPath        NVARCHAR(1024)   NOT NULL,
        Status          NVARCHAR(24)     NOT NULL CONSTRAINT DF_Imports_Status DEFAULT N'Processing',
        TotalRows       INT              NOT NULL CONSTRAINT DF_Imports_TotalRows DEFAULT 0,
        LandedRows      INT              NOT NULL CONSTRAINT DF_Imports_LandedRows DEFAULT 0,
        FlaggedRows     INT              NOT NULL CONSTRAINT DF_Imports_FlaggedRows DEFAULT 0,
        StartedByUserId UNIQUEIDENTIFIER NOT NULL,
        StartedAt       DATETIME2        NOT NULL CONSTRAINT DF_Imports_StartedAt DEFAULT SYSUTCDATETIME(),
        CompletedAt     DATETIME2        NULL,

        CreatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Imports_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Imports_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy       NVARCHAR(256)    NOT NULL,
        UpdatedBy       NVARCHAR(256)    NOT NULL,
        IsDeleted       BIT              NOT NULL CONSTRAINT DF_Imports_IsDeleted DEFAULT 0,
        DeletedAt       DATETIME2        NULL,

        CONSTRAINT PK_Imports PRIMARY KEY CLUSTERED (ImportId),
        CONSTRAINT FK_Imports_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Imports_Users FOREIGN KEY (StartedByUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Imports_Status CHECK (Status IN (N'Processing', N'Completed', N'CompletedWithErrors', N'Failed'))
    );
END;
GO

-- FK index on WorkspaceId (database-performance.md — every FK column has a non-clustered index;
-- also drives the admin access gate on the status read).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Imports_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Imports'))
    CREATE NONCLUSTERED INDEX IX_Imports_WorkspaceId ON dbo.Imports (WorkspaceId) WHERE IsDeleted = 0;
GO

-- FK index on StartedByUserId (database-performance.md).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Imports_StartedByUserId' AND object_id = OBJECT_ID(N'dbo.Imports'))
    CREATE NONCLUSTERED INDEX IX_Imports_StartedByUserId ON dbo.Imports (StartedByUserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_046_CreateImports')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_046_CreateImports', SUSER_SNAME(), N'Slice 16 — Imports job-state table (CSV import).');
END;
GO
