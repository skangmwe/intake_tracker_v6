-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Creates dbo.Drafts — pre-record, personal, discardable intake state
--              (data-model.md §Draft, BS §9.8). A Draft sits OUTSIDE the no-hard-delete
--              floor: its owner may physically DELETE it (the sole exception in the schema).
--              Body is the prefilled field-value map + queued related-record ids as JSON.
--              No audit columns beyond Created/Updated/By — drafts are pre-audit.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Drafts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Drafts
    (
        DraftId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Drafts_DraftId DEFAULT NEWSEQUENTIALID(),
        OwnerUserId   UNIQUEIDENTIFIER NOT NULL,
        WorkspaceId   UNIQUEIDENTIFIER NOT NULL,
        -- 'Request' | 'Task' | 'Announcement' | 'Feature' — Requests slice writes 'Request' only.
        ObjectType    NVARCHAR(16)     NOT NULL CONSTRAINT DF_Drafts_ObjectType DEFAULT N'Request',
        -- A short human label so the Drafts list is scannable (the request name if typed).
        Title         NVARCHAR(400)    NULL,
        -- Prefilled field values + queued related-record ids: { "fields": {...}, "related": [...] }.
        Body          NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_Drafts_Body DEFAULT N'{}',
        LastEditedAt  DATETIME2        NOT NULL CONSTRAINT DF_Drafts_LastEditedAt DEFAULT SYSUTCDATETIME(),

        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Drafts_CreatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,

        CONSTRAINT PK_Drafts PRIMARY KEY CLUSTERED (DraftId),
        CONSTRAINT FK_Drafts_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Drafts_Users FOREIGN KEY (OwnerUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Drafts_ObjectType CHECK (ObjectType IN (N'Request', N'Task', N'Announcement', N'Feature')),
        CONSTRAINT CK_Drafts_Body_Json CHECK (ISJSON(Body) = 1)
    );
END;
GO

-- Owner's Drafts list, newest first (FK index + covering the list read).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Drafts_Owner' AND object_id = OBJECT_ID(N'dbo.Drafts'))
    CREATE NONCLUSTERED INDEX IX_Drafts_Owner
        ON dbo.Drafts (OwnerUserId, WorkspaceId, LastEditedAt DESC)
        INCLUDE (ObjectType, Title);
GO

-- FK index on WorkspaceId.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Drafts_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Drafts'))
    CREATE NONCLUSTERED INDEX IX_Drafts_WorkspaceId ON dbo.Drafts (WorkspaceId);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_030_CreateDrafts')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_030_CreateDrafts', SUSER_SNAME(), N'Slice 5 — Drafts table (pre-record, owner-discardable).');
END;
GO
