-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: The ScheduledTrigger table — one row per time-based trigger (BS §15 Phase 3;
--              design spec docs/superpowers/specs/2026-07-24-time-based-triggers-design.md §3.3).
--              Object-agnostic (ObjectType) so the engine is not Request-locked. Kind distinguishes
--              admin-authored Request triggers from the built-in Task-overdue / Approval-overdue types.
--              Recipients is a JSON array of user-reference field keys (or a built-in audience marker).
--              Seeded triggers ship IsEnabled = 0 (opt-in) — no surprise notifications on first deploy.
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'ScheduledTrigger' AND schema_id = SCHEMA_ID(N'dbo'))
BEGIN
    CREATE TABLE dbo.ScheduledTrigger
    (
        TriggerId           UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ScheduledTrigger_TriggerId DEFAULT NEWSEQUENTIALID(),
        WorkspaceId         UNIQUEIDENTIFIER NOT NULL,
        -- The object the trigger evaluates (e.g. 'Request'). Only Request is authorable this cycle.
        ObjectType          NVARCHAR(64)     NOT NULL,
        -- 'Authored'        → admin-composed conditions over the object's field map.
        -- 'TaskOverdue'     → built-in: open Task past its Due Date.
        -- 'ApprovalOverdue' → built-in: open ApprovalRequest past its RespondByDate.
        Kind                NVARCHAR(32)     NOT NULL,
        Name                NVARCHAR(200)    NOT NULL,
        IsEnabled           BIT              NOT NULL CONSTRAINT DF_ScheduledTrigger_IsEnabled DEFAULT 0,
        -- 'Once'            → fire on the first matching day only (watermark blocks re-fire forever).
        -- 'RepeatEveryNDays'→ re-fire when LastFiredDate + RepeatIntervalDays <= today.
        Cadence             NVARCHAR(32)     NOT NULL,
        RepeatIntervalDays  INT              NULL,
        -- Optional 'N days' for built-in types (e.g. a due-soon lead); NULL when not used.
        WindowDays          INT              NULL,
        -- JSON array of user-reference field keys to notify (e.g. ["assignedAnalyst","watchers"]).
        Recipients          NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_ScheduledTrigger_Recipients DEFAULT N'[]',
        -- The notification category the trigger fires under (design spec §3.5) — drives the bell
        -- category and the per-user preference mapping. Distinct from Kind: an Authored trigger picks
        -- 'sla-reminder' or 'benefit-review'; the built-in kinds use 'task-overdue' / 'approval-overdue'.
        NotificationCategory NVARCHAR(32)    NOT NULL,
        -- Admin-authored bell text (notice text, not record PII — like an announcement title).
        NotificationTitle   NVARCHAR(200)    NOT NULL,
        NotificationBody    NVARCHAR(MAX)    NOT NULL,

        CreatedAt           DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTrigger_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt           DATETIME2        NOT NULL CONSTRAINT DF_ScheduledTrigger_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy           NVARCHAR(256)    NOT NULL,
        UpdatedBy           NVARCHAR(256)    NOT NULL,
        IsDeleted           BIT              NOT NULL CONSTRAINT DF_ScheduledTrigger_IsDeleted DEFAULT 0,
        DeletedAt           DATETIME2        NULL,

        CONSTRAINT PK_ScheduledTrigger PRIMARY KEY CLUSTERED (TriggerId),
        CONSTRAINT FK_ScheduledTrigger_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_ScheduledTrigger_Kind CHECK (Kind IN (N'Authored', N'TaskOverdue', N'ApprovalOverdue')),
        CONSTRAINT CK_ScheduledTrigger_Cadence CHECK (Cadence IN (N'Once', N'RepeatEveryNDays')),
        CONSTRAINT CK_ScheduledTrigger_NotificationCategory CHECK (NotificationCategory IN (
            N'sla-reminder', N'benefit-review', N'task-overdue', N'approval-overdue')),
        -- RepeatEveryNDays requires a positive interval; Once must not carry one.
        CONSTRAINT CK_ScheduledTrigger_RepeatInterval CHECK (
            (Cadence = N'RepeatEveryNDays' AND RepeatIntervalDays >= 1)
            OR (Cadence = N'Once' AND RepeatIntervalDays IS NULL))
    );
END;
GO

-- FK index on WorkspaceId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ScheduledTrigger_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.ScheduledTrigger'))
    CREATE NONCLUSTERED INDEX IX_ScheduledTrigger_WorkspaceId ON dbo.ScheduledTrigger (WorkspaceId) WHERE IsDeleted = 0;
GO
