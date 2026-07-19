-- =============================================
-- Author:      /dev-build-application (Slice 29 — Toolkit object + S43 surface)
-- Create Date: 2026-07-19
-- Description: Creates dbo.ToolkitItem — the reference-local Toolkit record (build spec §2.6 / §19,
--              v2-reconciliation.md §Model deltas 5, S43 prototype). A Toolkit item is one lightweight
--              object with a Type field (Playbook / Plugin / Prompt) that runs on the platform engine
--              but carries none of the Request's lifecycle, gates, Outcome, or bridge.
--
--              The record id is minted from the home workspace's own prefix/sequence via
--              usp_MintRecordId (a Toolkit item never crosses the bridge, so there is no shared-key /
--              second-row concern — the composite PK (WorkspaceId, RecordId) mirrors Features and the
--              minted id doubles as the human-facing Record ID shown in the S43 list/detail).
--
--              Field set follows the S43 prototype (authoritative): Kind, Status, Name, One-liner,
--              Description, Maintainer, How-to-use, Body (pasted asset content), and a single uploaded
--              Attachment (stored as a row-level blob pointer — AttachmentBlobPath + FileName +
--              ContentType + SizeBytes — per v2-recon model delta 5; not the Attachments-module table).
--              Status (Active/Draft/Archived) is a display field distinct from soft-delete/retire.
--              RowVer (ROWVERSION) backs the PATCH ETag / optimistic concurrency.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ToolkitItem', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ToolkitItem
    (
        RecordId              NVARCHAR(20)     NOT NULL,
        -- The item's home workspace (Toolkit is workspace-local, seeded in AI Solutions first).
        WorkspaceId           UNIQUEIDENTIFIER NOT NULL,
        -- The originating workspace name, resolved from the ID prefix at mint (BS §17.1).
        Origin                NVARCHAR(200)    NULL,
        -- Playbook / Plugin / Prompt — the only field that distinguishes one kind from another.
        Kind                  NVARCHAR(20)     NOT NULL,
        -- Active / Draft / Archived — the S43 status badge (display state, not soft-delete).
        Status                NVARCHAR(20)     NOT NULL CONSTRAINT DF_ToolkitItem_Status DEFAULT N'Draft',
        Name                  NVARCHAR(200)    NOT NULL,
        -- A scannable one-sentence summary (AI-populated in R2; user-editable now).
        OneLiner              NVARCHAR(300)    NULL,
        Description           NVARCHAR(2000)   NULL,
        -- The maintainer / who to ask — free text in R1 (no user directory endpoint yet).
        Maintainer            NVARCHAR(200)    NULL,
        -- Short guidance on how another person picks this up and applies it.
        HowTo                 NVARCHAR(2000)   NULL,
        -- Pasted asset content (the playbook's instructions, the prompt's text, the plugin's notes).
        BodyMarkdown          NVARCHAR(MAX)    NULL,

        -- Single uploaded file — a row-level blob pointer (SQL is the source of truth for the path).
        AttachmentBlobPath    NVARCHAR(400)    NULL,
        AttachmentFileName    NVARCHAR(400)    NULL,
        AttachmentContentType NVARCHAR(200)    NULL,
        AttachmentSizeBytes   BIGINT           NULL,

        RowVer                ROWVERSION       NOT NULL,

        CreatedAt             DATETIME2        NOT NULL CONSTRAINT DF_ToolkitItem_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt             DATETIME2        NOT NULL CONSTRAINT DF_ToolkitItem_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy             NVARCHAR(256)    NOT NULL,
        UpdatedBy             NVARCHAR(256)    NOT NULL,
        IsDeleted             BIT              NOT NULL CONSTRAINT DF_ToolkitItem_IsDeleted DEFAULT 0,
        DeletedAt             DATETIME2        NULL,

        -- Composite PK mirrors Features/Requests for the shared minted id (an item exists once per
        -- workspace; Toolkit items never duplicate across the bridge — they never cross it).
        CONSTRAINT PK_ToolkitItem PRIMARY KEY CLUSTERED (WorkspaceId, RecordId),
        CONSTRAINT FK_ToolkitItem_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_ToolkitItem_Kind CHECK (Kind IN (N'Playbook', N'Plugin', N'Prompt')),
        CONSTRAINT CK_ToolkitItem_Status CHECK (Status IN (N'Active', N'Draft', N'Archived'))
    );
END;
GO

-- Id lookup (detail read + retire/restore by id).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ToolkitItem_RecordId' AND object_id = OBJECT_ID(N'dbo.ToolkitItem'))
    CREATE NONCLUSTERED INDEX IX_ToolkitItem_RecordId
        ON dbo.ToolkitItem (RecordId) WHERE IsDeleted = 0;
GO

-- Covering index for the S43 Toolkit list surface (workspace-scoped, filtered/sorted).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ToolkitItem_List' AND object_id = OBJECT_ID(N'dbo.ToolkitItem'))
    CREATE NONCLUSTERED INDEX IX_ToolkitItem_List
        ON dbo.ToolkitItem (WorkspaceId, IsDeleted)
        INCLUDE (Kind, Status, Name, OneLiner, Maintainer, AttachmentBlobPath, UpdatedBy, UpdatedAt);
GO

-- Per-workspace name uniqueness (v2-reconciliation.md §Model deltas 5), excluding retired rows.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ToolkitItem_Workspace_Name' AND object_id = OBJECT_ID(N'dbo.ToolkitItem'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ToolkitItem_Workspace_Name
        ON dbo.ToolkitItem (WorkspaceId, Name) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260719_065_CreateToolkitItem')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260719_065_CreateToolkitItem', SUSER_SNAME(), N'Slice 29 — ToolkitItem table (Toolkit reference object).');
END;
GO
