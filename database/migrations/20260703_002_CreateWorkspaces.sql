-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Creates dbo.Workspaces — one row per PG/Dept workspace or the
--              central AI Solutions workspace. Holds the globally-unique prefix
--              and the monotonic per-workspace mint counter (BS §6.7).
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Workspaces', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Workspaces
    (
        WorkspaceId   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Workspaces_WorkspaceId DEFAULT NEWSEQUENTIALID(),
        Name          NVARCHAR(200)    NOT NULL,
        -- 'ai-solutions' | 'pg-dept' | 'pg-dept-template'
        Kind          NVARCHAR(32)     NOT NULL,
        -- Globally unique per BS §6.7. Enforces the prefix registry.
        Prefix        NVARCHAR(16)     NOT NULL,
        -- Monotonic mint counter. First minted record is PREFIX-00000001 (BS §6.7).
        NextSequence  BIGINT           NOT NULL CONSTRAINT DF_Workspaces_NextSequence DEFAULT 0,
        -- Retired workspaces keep the registry entry so Origin resolves for historical records.
        RetiredAt     DATETIME2        NULL,

        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Workspaces_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Workspaces_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,
        IsDeleted     BIT              NOT NULL CONSTRAINT DF_Workspaces_IsDeleted DEFAULT 0,
        DeletedAt     DATETIME2        NULL,

        CONSTRAINT PK_Workspaces PRIMARY KEY CLUSTERED (WorkspaceId),
        CONSTRAINT CK_Workspaces_Kind CHECK (Kind IN (N'ai-solutions', N'pg-dept', N'pg-dept-template'))
    );
END;
GO

-- Prefix is globally unique across active workspaces (retired keep the row; a prefix is never reused).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Workspaces_Prefix' AND object_id = OBJECT_ID(N'dbo.Workspaces'))
BEGIN
    CREATE UNIQUE INDEX UX_Workspaces_Prefix ON dbo.Workspaces (Prefix) WHERE IsDeleted = 0;
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_002_CreateWorkspaces')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_002_CreateWorkspaces', SUSER_SNAME(), N'Slice 1 — Workspaces table.');
END;
GO
