-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Creates dbo.RoleLabelCatalog — the platform-scope catalog of gate role
--              labels (BS §4.3, §7.2). Not per-workspace: one firm-wide list that S31's
--              approver-slot and approver-team selectors draw from. Seeded here (028);
--              full CRUD is S37 / slice 19. Rename/retire are forward-only (past sign-offs
--              keep their captured label). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.RoleLabelCatalog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RoleLabelCatalog
    (
        RoleLabelId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RoleLabelCatalog_RoleLabelId DEFAULT NEWSEQUENTIALID(),
        Label       NVARCHAR(120)    NOT NULL,
        SortOrder   INT              NOT NULL CONSTRAINT DF_RoleLabelCatalog_SortOrder DEFAULT 0,

        CreatedAt   DATETIME2        NOT NULL CONSTRAINT DF_RoleLabelCatalog_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt   DATETIME2        NOT NULL CONSTRAINT DF_RoleLabelCatalog_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy   NVARCHAR(256)    NOT NULL,
        UpdatedBy   NVARCHAR(256)    NOT NULL,
        IsDeleted   BIT              NOT NULL CONSTRAINT DF_RoleLabelCatalog_IsDeleted DEFAULT 0,
        DeletedAt   DATETIME2        NULL,

        CONSTRAINT PK_RoleLabelCatalog PRIMARY KEY CLUSTERED (RoleLabelId)
    );
END;
GO

-- One active row per label.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RoleLabelCatalog_Label' AND object_id = OBJECT_ID(N'dbo.RoleLabelCatalog'))
    CREATE UNIQUE INDEX UX_RoleLabelCatalog_Label
        ON dbo.RoleLabelCatalog (Label) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_027_CreateRoleLabelCatalog')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_027_CreateRoleLabelCatalog', SUSER_SNAME(), N'Slice 4 — RoleLabelCatalog table (platform-scope).');
END;
GO
