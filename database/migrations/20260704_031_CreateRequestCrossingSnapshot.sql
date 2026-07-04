-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Creates dbo.RequestCrossingSnapshot — the per-crossing-field snapshot taken
--              when a PG-side Request is escalated (data-model.md §escalation bridge, BS §6.2).
--              Each row preserves a mapped crossing field's PG-side value at the escalation
--              moment and flags it locked. The Requests slice OWNS the table's creation
--              (slice-plan §Slice 5); it is POPULATED by the escalation endpoint in slice 9.
--              No writes happen against it in slice 5. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.RequestCrossingSnapshot', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RequestCrossingSnapshot
    (
        SnapshotId          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RequestCrossingSnapshot_SnapshotId DEFAULT NEWSEQUENTIALID(),
        -- The shared canonical RecordId (same value on both sides of the bridge).
        RecordId            NVARCHAR(20)     NOT NULL,
        -- The PG-side workspace whose crossing field is snapshotted + locked.
        WorkspaceId         UNIQUEIDENTIFIER NOT NULL,
        FieldKey            NVARCHAR(64)     NOT NULL,
        -- The PG-side value at the escalation moment (JSON-encoded scalar/array).
        SnapshotValue       NVARCHAR(MAX)    NULL,
        LockedAtEscalation  BIT              NOT NULL CONSTRAINT DF_RequestCrossingSnapshot_Locked DEFAULT 1,
        SnapshotAt          DATETIME2        NOT NULL CONSTRAINT DF_RequestCrossingSnapshot_SnapshotAt DEFAULT SYSUTCDATETIME(),

        CreatedAt           DATETIME2        NOT NULL CONSTRAINT DF_RequestCrossingSnapshot_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt           DATETIME2        NOT NULL CONSTRAINT DF_RequestCrossingSnapshot_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy           NVARCHAR(256)    NOT NULL,
        UpdatedBy           NVARCHAR(256)    NOT NULL,
        IsDeleted           BIT              NOT NULL CONSTRAINT DF_RequestCrossingSnapshot_IsDeleted DEFAULT 0,
        DeletedAt           DATETIME2        NULL,

        CONSTRAINT PK_RequestCrossingSnapshot PRIMARY KEY CLUSTERED (SnapshotId),
        CONSTRAINT FK_RequestCrossingSnapshot_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        -- One snapshot per (record, workspace-side, field).
        CONSTRAINT UQ_RequestCrossingSnapshot UNIQUE (RecordId, WorkspaceId, FieldKey)
    );
END;
GO

-- Lookup of a record's snapshotted crossing fields on a given side.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RequestCrossingSnapshot_Record' AND object_id = OBJECT_ID(N'dbo.RequestCrossingSnapshot'))
    CREATE NONCLUSTERED INDEX IX_RequestCrossingSnapshot_Record
        ON dbo.RequestCrossingSnapshot (RecordId, WorkspaceId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_031_CreateRequestCrossingSnapshot')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_031_CreateRequestCrossingSnapshot', SUSER_SNAME(), N'Slice 5 — RequestCrossingSnapshot table (populated in slice 9).');
END;
GO
