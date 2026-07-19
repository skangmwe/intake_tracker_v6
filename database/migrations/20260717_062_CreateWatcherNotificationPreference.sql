-- =============================================
-- Author:      /dev-build-application (Slice 26 — per-record notification preferences)
-- Create Date: 2026-07-17
-- Description: Creates dbo.WatcherNotificationPreference — the sparse per-side, per-user
--              categorical preference table (v2-reconciliation.md §Model deltas 6).
--
--              Divergence resolved (Slice 26 cut plan D4): the v2 addendum's proposed shape
--              includes an IsWatching column and keys on (UserId, RecordId), implying a
--              replacement for the existing dbo.Watchers table. But dbo.Watchers is per-side
--              (RecordId, WorkspaceId, UserId) and carries SubscribedAt/UnsubscribedAt
--              history that the preference shape lacks. This migration keeps dbo.Watchers as
--              the presence source of truth (subscribe/unsubscribe with audit history) and
--              adds this table as a sparse preference layer with:
--                - NO IsWatching column (presence is authoritative in dbo.Watchers).
--                - Key (UserId, RecordId, WorkspaceId) — matches the per-side pattern so a
--                  bridged user can hold distinct prefs per side.
--                - Five preference booleans, all default 1 (opt-out model — an active
--                  watcher receives every category by default).
--                - Six audit columns per database-coding-standards.md.
--              A missing preference row means "all five defaults apply." Rows are upserted
--              only when the user diverges from the defaults; unsubscribing does NOT delete
--              the preference row (per addendum: "preferences persist so they're restored
--              on re-subscribe").
--
--              Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.WatcherNotificationPreference', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.WatcherNotificationPreference
    (
        PreferenceId                     UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_WatcherNotificationPreference_PreferenceId DEFAULT NEWSEQUENTIALID(),
        UserId                           UNIQUEIDENTIFIER NOT NULL,
        RecordId                         NVARCHAR(20)     NOT NULL,
        WorkspaceId                      UNIQUEIDENTIFIER NOT NULL,

        -- The five categorical preferences (v2-reconciliation.md §Model deltas 6).
        -- All default 1 — an active watcher receives every category unless they opt out.
        NotifyGateDecisions              BIT NOT NULL CONSTRAINT DF_WatcherNotificationPreference_NotifyGateDecisions            DEFAULT 1,
        NotifyStatusChanges              BIT NOT NULL CONSTRAINT DF_WatcherNotificationPreference_NotifyStatusChanges            DEFAULT 1,
        NotifyTaskSignoffs               BIT NOT NULL CONSTRAINT DF_WatcherNotificationPreference_NotifyTaskSignoffs             DEFAULT 1,
        NotifySlaAndDueDateReminders     BIT NOT NULL CONSTRAINT DF_WatcherNotificationPreference_NotifySlaAndDueDateReminders   DEFAULT 1,
        NotifyMentionsAndComments        BIT NOT NULL CONSTRAINT DF_WatcherNotificationPreference_NotifyMentionsAndComments      DEFAULT 1,

        CreatedAt                        DATETIME2        NOT NULL
            CONSTRAINT DF_WatcherNotificationPreference_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt                        DATETIME2        NOT NULL
            CONSTRAINT DF_WatcherNotificationPreference_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy                        NVARCHAR(256)    NOT NULL,
        UpdatedBy                        NVARCHAR(256)    NOT NULL,
        IsDeleted                        BIT              NOT NULL
            CONSTRAINT DF_WatcherNotificationPreference_IsDeleted DEFAULT 0,
        DeletedAt                        DATETIME2        NULL,

        CONSTRAINT PK_WatcherNotificationPreference PRIMARY KEY CLUSTERED (PreferenceId),
        CONSTRAINT FK_WatcherNotificationPreference_Users FOREIGN KEY (UserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_WatcherNotificationPreference_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

-- FK indexes (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WatcherNotificationPreference_UserId' AND object_id = OBJECT_ID(N'dbo.WatcherNotificationPreference'))
    CREATE NONCLUSTERED INDEX IX_WatcherNotificationPreference_UserId ON dbo.WatcherNotificationPreference (UserId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WatcherNotificationPreference_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.WatcherNotificationPreference'))
    CREATE NONCLUSTERED INDEX IX_WatcherNotificationPreference_WorkspaceId ON dbo.WatcherNotificationPreference (WorkspaceId) WHERE IsDeleted = 0;
GO

-- Fan-out lookup: usp_FanOutNotification joins on (RecordId, WorkspaceId, UserId) to fetch
-- each watcher's prefs before enqueueing. Covering index keeps the join a single-page seek.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_WatcherNotificationPreference_Fanout' AND object_id = OBJECT_ID(N'dbo.WatcherNotificationPreference'))
    CREATE NONCLUSTERED INDEX IX_WatcherNotificationPreference_Fanout
        ON dbo.WatcherNotificationPreference (RecordId, WorkspaceId, UserId)
        INCLUDE (NotifyGateDecisions, NotifyStatusChanges, NotifyTaskSignoffs,
                 NotifySlaAndDueDateReminders, NotifyMentionsAndComments)
        WHERE IsDeleted = 0;
GO

-- One live preference row per (user, record, side). Backstops the idempotent upsert; retired
-- rows soft-delete so history is retained if a user is deactivated and later re-created.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_WatcherNotificationPreference_User_Record_Workspace_Active' AND object_id = OBJECT_ID(N'dbo.WatcherNotificationPreference'))
    CREATE UNIQUE INDEX UX_WatcherNotificationPreference_User_Record_Workspace_Active
        ON dbo.WatcherNotificationPreference (UserId, RecordId, WorkspaceId)
        WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260717_062_CreateWatcherNotificationPreference')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260717_062_CreateWatcherNotificationPreference', SUSER_SNAME(),
            N'Slice 26 — WatcherNotificationPreference table (sparse per-side per-user preference layer).');
END;
GO
