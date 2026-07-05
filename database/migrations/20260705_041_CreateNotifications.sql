-- =============================================
-- Author:      /dev-build-application (Slice 12 — Watchers + Notifications)
-- Create Date: 2026-07-05
-- Description: Creates dbo.Notifications — the per-user delivery log for the bell centre
--              (BS §11.3, data-model.md §Notification, module-boundaries §16). One row per
--              (target user, event) is materialised IN-PROCESS by usp_FanOutNotification when
--              the event spine emits — the Service-Bus/Worker path is a no-op on the dev stack
--              (same pattern as slice 9's derived mirror / slice 11's config-selected blob).
--
--              Summary is a human-readable line built from the record id + category — never raw
--              PII / field values (api-pii-handling.md). ReadAt NULL = unread (drives the badge).
--              The dedup UNIQUE key means a user watching BOTH sides of an escalated record gets
--              exactly one row for a given SourceEventId. Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Notifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Notifications
    (
        NotificationId  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Notifications_NotificationId DEFAULT NEWSEQUENTIALID(),
        UserId          UNIQUEIDENTIFIER NOT NULL,
        WorkspaceId     UNIQUEIDENTIFIER NOT NULL,
        -- The record the notification points at; NULL for non-record events.
        RecordId        NVARCHAR(20)     NULL,
        Category        NVARCHAR(32)     NOT NULL,
        Summary         NVARCHAR(400)    NOT NULL,
        -- The spine EventId that produced this row — dedup + trace key.
        SourceEventId   UNIQUEIDENTIFIER NOT NULL,
        -- Set on mark-read; NULL = unread.
        ReadAt          DATETIME2        NULL,

        CreatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Notifications_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2        NOT NULL CONSTRAINT DF_Notifications_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy       NVARCHAR(256)    NOT NULL,
        UpdatedBy       NVARCHAR(256)    NOT NULL,
        IsDeleted       BIT              NOT NULL CONSTRAINT DF_Notifications_IsDeleted DEFAULT 0,
        DeletedAt       DATETIME2        NULL,

        CONSTRAINT PK_Notifications PRIMARY KEY CLUSTERED (NotificationId),
        CONSTRAINT FK_Notifications_Users FOREIGN KEY (UserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Notifications_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Notifications_Category CHECK (Category IN (
            N'sign-off-requested', N'gate-decided', N'assigned-to-you', N'escalation-received',
            N'hold-changed', N'mentioned', N'announcement-posted', N'closed'))
    );
END;
GO

-- FK index on WorkspaceId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Notifications_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.Notifications'))
    CREATE NONCLUSTERED INDEX IX_Notifications_WorkspaceId ON dbo.Notifications (WorkspaceId) WHERE IsDeleted = 0;
GO

-- The bell feed + unread-count: caller's rows, newest first. ReadAt INCLUDEd so the
-- unread-count is a covering scan (no key lookup).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Notifications_User_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Notifications'))
    CREATE NONCLUSTERED INDEX IX_Notifications_User_CreatedAt
        ON dbo.Notifications (UserId, CreatedAt DESC)
        INCLUDE (ReadAt) WHERE IsDeleted = 0;
GO

-- Dedup: one row per (user, record, category, source event). A user watching both sides of an
-- escalated record (same SourceEventId) receives exactly one row — the fan-out proc relies on this.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Notifications_User_Record_Category_Event' AND object_id = OBJECT_ID(N'dbo.Notifications'))
    CREATE UNIQUE INDEX UX_Notifications_User_Record_Category_Event
        ON dbo.Notifications (UserId, RecordId, Category, SourceEventId)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260705_041_CreateNotifications')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260705_041_CreateNotifications', SUSER_SNAME(), N'Slice 12 — Notifications table (per-user bell delivery log).');
END;
GO
