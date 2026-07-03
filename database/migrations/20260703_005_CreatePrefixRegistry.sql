-- =============================================
-- Author:      /dev-build-application (Slice 1 — Foundation)
-- Create Date: 2026-07-03
-- Description: Creates dbo.PrefixRegistry — platform-scope, immutable historical
--              map of workspace prefix -> workspace + name at mint time (BS §6.7).
--              Read at every ID mint and every Origin resolution. A prefix is never
--              reused, so retired workspaces keep their row. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.PrefixRegistry', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PrefixRegistry
    (
        Prefix               NVARCHAR(16)     NOT NULL,
        WorkspaceId          UNIQUEIDENTIFIER NOT NULL,
        -- Snapshot of the workspace name at mint time so Origin resolves even after rename.
        WorkspaceNameAtMint  NVARCHAR(200)    NOT NULL,

        CreatedAt            DATETIME2        NOT NULL CONSTRAINT DF_PrefixRegistry_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt            DATETIME2        NOT NULL CONSTRAINT DF_PrefixRegistry_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy            NVARCHAR(256)    NOT NULL,
        UpdatedBy            NVARCHAR(256)    NOT NULL,
        IsDeleted            BIT              NOT NULL CONSTRAINT DF_PrefixRegistry_IsDeleted DEFAULT 0,
        DeletedAt            DATETIME2        NULL,

        CONSTRAINT PK_PrefixRegistry PRIMARY KEY CLUSTERED (Prefix),
        CONSTRAINT FK_PrefixRegistry_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        -- One prefix per workspace.
        CONSTRAINT UQ_PrefixRegistry_WorkspaceId UNIQUE (WorkspaceId)
    );
END;
GO

-- FK index (the UNIQUE on WorkspaceId already provides an index on that column; add one only if absent).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PrefixRegistry_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.PrefixRegistry'))
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_PrefixRegistry_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.PrefixRegistry'))
    CREATE NONCLUSTERED INDEX IX_PrefixRegistry_WorkspaceId ON dbo.PrefixRegistry (WorkspaceId);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_005_CreatePrefixRegistry')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_005_CreatePrefixRegistry', SUSER_SNAME(), N'Slice 1 — PrefixRegistry table.');
END;
GO
