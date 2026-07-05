-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: Creates dbo.ApprovalRequests — one row per gate firing on a Request
--              (data-model.md §ApprovalRequest, BS §7.2). When a gated stage transition fires,
--              usp_OpenGate freezes the gate's approver slots (team/role label + eligible members
--              resolved live from ApproverTeamMembership) into FrozenApproverSet and opens the
--              request in the Pending state. The gate advances the record to ToStageKey only once
--              every frozen slot reaches Approved (usp_SubmitDecision); a rejected slot moves the
--              gate to ChangesRequested until re-requested or approved.
--
--              WorkspaceId is stored per-side (like Tasks / Comments) so the gate stays on the
--              correct copy of an escalated record (slice 9) and the access gate can JOIN
--              WorkspaceMembership. The composite FK (WorkspaceId, RequestRecordId) → Requests
--              matches the composite Requests PK.
--
--              The stage transition is FROZEN at open (keys drive the advance; labels drive the
--              "fires on Build → QA" pill) so a later lifecycle rename never rewrites a gate in
--              flight. Exactly one unresolved gate per record is enforced by a filtered UNIQUE
--              index — the race backstop behind usp_OpenGate's gate-already-open pre-check.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ApprovalRequests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApprovalRequests
    (
        ApprovalRequestId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ApprovalRequests_Id DEFAULT NEWSEQUENTIALID(),
        -- The Request the gate fires on, per side (bridge, slice 9). Composite FK to Requests PK.
        RequestRecordId   NVARCHAR(20)     NOT NULL,
        WorkspaceId       UNIQUEIDENTIFIER NOT NULL,
        -- The gate whose config this firing snapshots. Retained for provenance / audit.
        GateDefinitionId  UNIQUEIDENTIFIER NOT NULL,
        -- Frozen at open so a later lifecycle rename never rewrites a gate in flight.
        GateName          NVARCHAR(200)    NOT NULL,
        FromStageKey      NVARCHAR(64)     NOT NULL,
        ToStageKey        NVARCHAR(64)     NOT NULL,
        FromStageLabel    NVARCHAR(120)    NOT NULL,
        ToStageLabel      NVARCHAR(120)    NOT NULL,
        -- Gate-level state: Pending → ChangesRequested (a slot rejected) → Resolved (all approved).
        State             NVARCHAR(24)     NOT NULL CONSTRAINT DF_ApprovalRequests_State DEFAULT N'Pending',
        -- Who triggered the stage advance that opened the gate. Nullable for system-opened gates.
        OpenedByUserId    UNIQUEIDENTIFIER NULL,
        OpenedAt          DATETIME2        NOT NULL CONSTRAINT DF_ApprovalRequests_OpenedAt DEFAULT SYSUTCDATETIME(),
        ResolvedAt        DATETIME2        NULL,
        -- Snapshot of the slot definitions + eligible members at open (BS §7.2 — frozen approver set).
        -- Shape: [{ slotIndex, roleLabel, displayLabel, eligibleMembers: [{ userId, displayName }] }].
        FrozenApproverSet NVARCHAR(MAX)    NOT NULL,

        CreatedAt         DATETIME2        NOT NULL CONSTRAINT DF_ApprovalRequests_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt         DATETIME2        NOT NULL CONSTRAINT DF_ApprovalRequests_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy         NVARCHAR(256)    NOT NULL,
        UpdatedBy         NVARCHAR(256)    NOT NULL,
        IsDeleted         BIT              NOT NULL CONSTRAINT DF_ApprovalRequests_IsDeleted DEFAULT 0,
        DeletedAt         DATETIME2        NULL,

        CONSTRAINT PK_ApprovalRequests PRIMARY KEY CLUSTERED (ApprovalRequestId),
        CONSTRAINT FK_ApprovalRequests_Requests FOREIGN KEY (WorkspaceId, RequestRecordId)
            REFERENCES dbo.Requests (WorkspaceId, RecordId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_ApprovalRequests_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_ApprovalRequests_GateDefinition FOREIGN KEY (GateDefinitionId)
            REFERENCES dbo.GateDefinition (GateDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_ApprovalRequests_Users FOREIGN KEY (OpenedByUserId)
            REFERENCES dbo.Users (UserId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_ApprovalRequests_State CHECK (State IN (N'Pending', N'ChangesRequested', N'Resolved')),
        CONSTRAINT CK_ApprovalRequests_FrozenIsJson CHECK (ISJSON(FrozenApproverSet) = 1)
    );
END;
GO

-- Composite FK index on (WorkspaceId, RequestRecordId) — also the hot per-record gate read path.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ApprovalRequests_Record_Workspace' AND object_id = OBJECT_ID(N'dbo.ApprovalRequests'))
    CREATE NONCLUSTERED INDEX IX_ApprovalRequests_Record_Workspace
        ON dbo.ApprovalRequests (WorkspaceId, RequestRecordId, OpenedAt) WHERE IsDeleted = 0;
GO

-- FK index on GateDefinitionId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ApprovalRequests_GateDefinitionId' AND object_id = OBJECT_ID(N'dbo.ApprovalRequests'))
    CREATE NONCLUSTERED INDEX IX_ApprovalRequests_GateDefinitionId ON dbo.ApprovalRequests (GateDefinitionId) WHERE IsDeleted = 0;
GO

-- FK index on OpenedByUserId.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ApprovalRequests_OpenedByUserId' AND object_id = OBJECT_ID(N'dbo.ApprovalRequests'))
    CREATE NONCLUSTERED INDEX IX_ApprovalRequests_OpenedByUserId ON dbo.ApprovalRequests (OpenedByUserId) WHERE IsDeleted = 0;
GO

-- At most one UNRESOLVED gate per record — the race backstop behind usp_OpenGate's pre-check.
-- (A record accumulates one Resolved gate per gated transition; only the current one is unresolved.)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ApprovalRequests_OpenPerRecord' AND object_id = OBJECT_ID(N'dbo.ApprovalRequests'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_ApprovalRequests_OpenPerRecord
        ON dbo.ApprovalRequests (WorkspaceId, RequestRecordId)
        WHERE State <> N'Resolved' AND IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_036_CreateApprovalRequests')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_036_CreateApprovalRequests', SUSER_SNAME(), N'Slice 8 — ApprovalRequests (gate-in-flight, frozen approver set).');
END;
GO
