-- =============================================
-- Author:      /dev-build-application (Slice 12 — Watchers + Notifications)
-- Create Date: 2026-07-05
-- Description: Creates dbo.Watchers — per-record subscriptions (BS §17.3, §11.2,
--              data-model.md §Watcher). A user can watch a record they don't own; the
--              Notifications fan-out (usp_FanOutNotification) reads live watchers to
--              route record events to the bell.
--
--              WorkspaceId is stored per-side (like Attachments / Comments / AuditEntry)
--              so a subscription lives on ONE side of an escalated record — a user may
--              watch the PG record, the AI record, or both (BS §6). RecordId has no hard
--              FK — the object type is inferred (Requests today), matching AuditEntry.
--
--              Unsubscribe is a soft clear (UnsubscribedAt), not a row delete, so a
--              re-subscribe is idempotent and history is retained. The filtered UNIQUE
--              index is the backstop behind usp_AddWatcher's idempotent upsert.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Watchers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Watchers
    (
        WatcherId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Watchers_WatcherId DEFAULT NEWSEQUENTIALID(),
        RecordId        NVARCHAR(20)     NOT NULL,
        -- Per-side: a subscription lives on one workspace's copy of the record (bridge, slice 9).
        WorkspaceId     UNIQUEIDENTIFIER NOT NULL,
        UserId          UNIQUEIDENTIFIER NOT NULL,
        SubscribedAt    DATETIME2        NOT NULL CONSTRAINT DF_Watchers_SubscribedAt DEFAULT SYSUTCDATETIME(),
        -- Soft-cleared subscription (unsubscribe). NULL = actively watching.
        UnsubscribedAt  DATETIME2        NULL,

        CreatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Watchers_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Watchers_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy       NVARCHAR(256)    NOT NULL,
        UpdatedBy       NVARCHAR(256)    NOT NULL,
        IsDeleted       BIT              NOT NULL CONSTRAINT DF_Watchers_IsDeleted DEFAULT 0,
        DeletedAt       DATETIME2        NULL,

        CONSTRAINT PK_Watchers PRIMARY KEY CLUSTERED (WatcherId),
        CONSTRAINT FK_Watchers_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Watchers_Users FOREIGN KEY (UserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- FK index on UserId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Watchers_UserId' AND object_id = OBJECT_ID(N'dbo.Watchers'))
    CREATE NONCLUSTERED INDEX IX_Watchers_UserId ON dbo.Watchers (UserId) WHERE IsDeleted = 0;
GO

-- FK index on WorkspaceId (also drives the per-side membership access gate on the list read).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Watchers_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Watchers'))
    CREATE NONCLUSTERED INDEX IX_Watchers_WorkspaceId ON dbo.Watchers (WorkspaceId) WHERE IsDeleted = 0;
GO

-- One live subscription per (record, side, user). The backstop behind the idempotent upsert;
-- filtered on active rows so a resubscribe after an unsubscribe re-uses the row.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Watchers_Record_Workspace_User_Active' AND object_id = OBJECT_ID(N'dbo.Watchers'))
    CREATE UNIQUE INDEX UX_Watchers_Record_Workspace_User_Active
        ON dbo.Watchers (RecordId, WorkspaceId, UserId)
        WHERE UnsubscribedAt IS NULL AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_040_CreateWatchers')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_040_CreateWatchers', SUSER_SNAME(), N'Slice 12 — Watchers table (per-record subscriptions).');
END;
GO
