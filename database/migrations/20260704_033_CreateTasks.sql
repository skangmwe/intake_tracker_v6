-- =============================================
-- Author:      /dev-build-application (Slice 7 — Tasks)
-- Create Date: 2026-07-04
-- Description: Creates dbo.Tasks — the lightweight child of a Request (BS §2.4, data-model.md
--              §Task). A Task runs on the same engine but carries none of the Request's
--              lifecycle. It groups by build Phase for the collapsible phase-grouped list, tracks
--              a Status (Open → Done, or Cancelled), an optional Notes & decisions field, and at
--              most one structured typed field captured from the workspace task-field library
--              (S30 — FieldDefinition rows with ObjectType='Task').
--
--              WorkspaceId is stored per-side (like Comments / Watcher) so a Task stays on the
--              correct copy of an escalated record (slice 9) and the access gate can join
--              WorkspaceMembership. The composite FK (WorkspaceId, RecordId) → Requests enforces
--              that the parent exists on that side; the composite Requests PK is (WorkspaceId,
--              RecordId), so the FK must be composite too.
--
--              SortOrder is a per-record creation sequence (set in usp_CreateTask /
--              usp_ApplyTaskBundle) so the read can render "created order first, completed sink to
--              the bottom" deterministically without depending on CreatedAt tie resolution.
--
--              The typed field is stored inline: FieldType names which single FieldValue* column
--              holds the value (url/text/number/date/select/checkbox). CK_Tasks_OneFieldValue
--              enforces at most one value column set (a checkbox's 0/false still counts as set).
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Tasks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Tasks
    (
        TaskId            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Tasks_TaskId DEFAULT NEWSEQUENTIALID(),
        -- Parent Request, per side (bridge, slice 9). Composite FK to the Requests composite PK.
        RecordId          NVARCHAR(20)     NOT NULL,
        WorkspaceId       UNIQUEIDENTIFIER NOT NULL,
        Title             NVARCHAR(400)    NOT NULL,
        -- Build phase for the collapsible phase-grouped list. 'Unphased' is the catch-all tail.
        Phase             NVARCHAR(32)     NOT NULL CONSTRAINT DF_Tasks_Phase DEFAULT N'Unphased',
        -- The member this task is assigned to (drives "assigned to you"). Defaults to the creator.
        AssigneeUserId    UNIQUEIDENTIFIER NULL,
        Status            NVARCHAR(16)     NOT NULL CONSTRAINT DF_Tasks_Status DEFAULT N'Open',
        -- Per-task Notes & decisions (expandable free-text, per prototype). Confidential — not logged.
        Notes             NVARCHAR(MAX)    NULL,
        -- Stamped on check-off, cleared on reopen (BS §2.4 / blueprint completed-date).
        CompletedAt       DATETIME2        NULL,
        -- Per-record creation sequence — the stable ordering key for the task list read.
        SortOrder         INT              NOT NULL CONSTRAINT DF_Tasks_SortOrder DEFAULT 0,

        -- Structured typed field (at most one per Task). FieldDefinitionId points at the workspace
        -- task-field library (S30). FieldLabel/FieldType are copied at capture time so the read
        -- renders without a second lookup. Exactly one FieldValue* is set, per FieldType.
        FieldDefinitionId UNIQUEIDENTIFIER NULL,
        FieldLabel        NVARCHAR(200)    NULL,
        FieldType         NVARCHAR(16)     NULL,
        FieldValueUrl     NVARCHAR(2048)   NULL,
        FieldValueText    NVARCHAR(MAX)    NULL,
        FieldValueNumber  DECIMAL(18,4)    NULL,
        FieldValueDate    DATE             NULL,
        FieldValueSelect  NVARCHAR(200)    NULL,
        FieldValueBool    BIT              NULL,

        CreatedAt         DATETIME2        NOT NULL CONSTRAINT DF_Tasks_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt         DATETIME2        NOT NULL CONSTRAINT DF_Tasks_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy         NVARCHAR(256)    NOT NULL,
        UpdatedBy         NVARCHAR(256)    NOT NULL,
        IsDeleted         BIT              NOT NULL CONSTRAINT DF_Tasks_IsDeleted DEFAULT 0,
        DeletedAt         DATETIME2        NULL,

        CONSTRAINT PK_Tasks PRIMARY KEY CLUSTERED (TaskId),
        CONSTRAINT FK_Tasks_Requests FOREIGN KEY (WorkspaceId, RecordId)
            REFERENCES dbo.Requests (WorkspaceId, RecordId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Tasks_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Tasks_Users FOREIGN KEY (AssigneeUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Tasks_FieldDefinition FOREIGN KEY (FieldDefinitionId)
            REFERENCES dbo.FieldDefinition (FieldDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Tasks_Status CHECK (Status IN (N'Locked', N'Open', N'Done', N'Cancelled')),
        CONSTRAINT CK_Tasks_Phase CHECK (Phase IN
            (N'Intake', N'Discovery', N'Build', N'QA', N'Deploy', N'Post-launch', N'Unphased')),
        CONSTRAINT CK_Tasks_FieldType CHECK (FieldType IS NULL OR FieldType IN
            (N'url', N'text', N'number', N'date', N'select', N'checkbox')),
        -- At most one typed-field value column is set (bool 0/false counts as set).
        CONSTRAINT CK_Tasks_OneFieldValue CHECK (
            (CASE WHEN FieldValueUrl    IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN FieldValueText   IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN FieldValueNumber IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN FieldValueDate   IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN FieldValueSelect IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN FieldValueBool   IS NOT NULL THEN 1 ELSE 0 END) <= 1)
    );
END;
GO

-- Composite FK index on (WorkspaceId, RecordId) — also the hot task-list read path.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Tasks_Record_Workspace' AND object_id = OBJECT_ID(N'dbo.Tasks'))
    CREATE NONCLUSTERED INDEX IX_Tasks_Record_Workspace
        ON dbo.Tasks (WorkspaceId, RecordId, SortOrder) WHERE IsDeleted = 0;
GO

-- FK index on AssigneeUserId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Tasks_AssigneeUserId' AND object_id = OBJECT_ID(N'dbo.Tasks'))
    CREATE NONCLUSTERED INDEX IX_Tasks_AssigneeUserId ON dbo.Tasks (AssigneeUserId) WHERE IsDeleted = 0;
GO

-- FK index on FieldDefinitionId.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Tasks_FieldDefinitionId' AND object_id = OBJECT_ID(N'dbo.Tasks'))
    CREATE NONCLUSTERED INDEX IX_Tasks_FieldDefinitionId ON dbo.Tasks (FieldDefinitionId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_033_CreateTasks')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_033_CreateTasks', SUSER_SNAME(), N'Slice 7 — Tasks table (phase-grouped, typed field).');
END;
GO
