-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Creates dbo.Requests — the primary record (BS §17, data-model.md §Request).
--              The record's minted ID is PREFIX-NNNNNNNN. Content-field values live in a
--              single FieldValues JSON map (the field schema is workspace-configurable, so
--              a fixed column per field would fight the data-driven design). Name, Description
--              and Stage are authoritative real columns (set explicitly, hot on lists). A few
--              list-critical values are projected from the JSON as PERSISTED computed columns
--              (DeptPgClient, AssignedAnalyst, DueDate, PriorityScore) so the Requests list
--              filters/sorts/covers without parsing JSON per row.
--
--              Escalation (slice 9) creates a SECOND row with the SAME RecordId on the AI
--              Solutions workspace, so uniqueness is on the PAIR (RecordId, WorkspaceId), not
--              RecordId alone — enforced by the clustered PK. One-time/one-way is layered on
--              top in slice 9.
--
--              RowVer (ROWVERSION) backs the PATCH ETag / optimistic concurrency.
--              Idempotent per database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.Requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Requests
    (
        RecordId      NVARCHAR(20)     NOT NULL,
        WorkspaceId   UNIQUEIDENTIFIER NOT NULL,
        -- The lifecycle the request runs on (chosen at intake via RequestType, else the
        -- workspace default). Stage options come from this lifecycle's StageDefinition rows.
        LifecycleId   UNIQUEIDENTIFIER NOT NULL,
        -- The originating workspace name, resolved from the ID prefix at mint (BS §17.1).
        Origin        NVARCHAR(200)    NULL,
        Name          NVARCHAR(400)    NOT NULL,
        Description   NVARCHAR(MAX)    NULL,
        -- Current lifecycle StageKey (e.g. 'intake'). NULL only transiently before first set.
        Stage         NVARCHAR(64)     NULL,
        -- The intake Submitted timestamp (per-side-honest: the AI-side row stamps at escalation).
        Submitted     DATETIME2        NOT NULL CONSTRAINT DF_Requests_Submitted DEFAULT SYSUTCDATETIME(),
        -- The content-field map, keyed by field key (BS §17) — the single source of truth for
        -- every content + lifecycle-derivation value (deptPgClient, businessValue, holdBlocked,
        -- outcome, …). Name/Description/Stage are ALSO promoted to real columns above for the hot
        -- list surface + covering index; the service mirrors them into this map for the condition
        -- engine (which derives Display/Mirror Status from stage/hold/outcome). PII discipline is
        -- enforced at the API log boundary, not the store (api-pii-handling.md).
        FieldValues   NVARCHAR(MAX)    NOT NULL CONSTRAINT DF_Requests_FieldValues DEFAULT N'{}',

        -- List-critical projections from the JSON map (PERSISTED so they index and cover).
        DeptPgClient    AS CAST(JSON_VALUE(FieldValues, N'$.deptPgClient')   AS NVARCHAR(200)) PERSISTED,
        AssignedAnalyst AS CAST(JSON_VALUE(FieldValues, N'$.assignedAnalyst') AS NVARCHAR(200)) PERSISTED,
        -- NOT PERSISTED: CONVERT-to-DATE from a string is non-deterministic (session-format
        -- dependent), so SQL Server won't persist/index it. Kept as a runtime-computed column —
        -- still filterable/sortable on the Requests list (evaluated per row at query time).
        DueDate         AS TRY_CONVERT(DATE, JSON_VALUE(FieldValues, N'$.dueDate'), 23),
        -- Priority Score = Business Value + Efficiency Gain − Level of Effort (BS §3.3).
        PriorityScore   AS (
            TRY_CONVERT(INT, JSON_VALUE(FieldValues, N'$.businessValue'))
          + TRY_CONVERT(INT, JSON_VALUE(FieldValues, N'$.efficiencyGain'))
          - TRY_CONVERT(INT, JSON_VALUE(FieldValues, N'$.levelOfEffort'))
        ) PERSISTED,

        RowVer        ROWVERSION       NOT NULL,

        CreatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Requests_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt     DATETIME2        NOT NULL CONSTRAINT DF_Requests_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy     NVARCHAR(256)    NOT NULL,
        UpdatedBy     NVARCHAR(256)    NOT NULL,
        IsDeleted     BIT              NOT NULL CONSTRAINT DF_Requests_IsDeleted DEFAULT 0,
        DeletedAt     DATETIME2        NULL,

        -- Composite PK: a record can exist once per workspace. Escalation (slice 9) adds a
        -- second row with the same RecordId on the AI Solutions workspace.
        CONSTRAINT PK_Requests PRIMARY KEY CLUSTERED (WorkspaceId, RecordId),
        CONSTRAINT FK_Requests_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Requests_Lifecycle FOREIGN KEY (LifecycleId)
            REFERENCES dbo.Lifecycle (LifecycleId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Requests_FieldValues_Json CHECK (ISJSON(FieldValues) = 1)
    );
END;
GO

-- Shared-key lookup across workspaces (escalation, slice 9) + FK index on RecordId.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Requests_RecordId' AND object_id = OBJECT_ID(N'dbo.Requests'))
    CREATE NONCLUSTERED INDEX IX_Requests_RecordId
        ON dbo.Requests (RecordId) WHERE IsDeleted = 0;
GO

-- FK index on LifecycleId (database-performance.md — every FK column has a non-clustered index).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Requests_LifecycleId' AND object_id = OBJECT_ID(N'dbo.Requests'))
    CREATE NONCLUSTERED INDEX IX_Requests_LifecycleId
        ON dbo.Requests (LifecycleId) WHERE IsDeleted = 0;
GO

-- Covering index for the Requests list surface (data-model.md §Index notes).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Requests_List' AND object_id = OBJECT_ID(N'dbo.Requests'))
    CREATE NONCLUSTERED INDEX IX_Requests_List
        ON dbo.Requests (WorkspaceId, IsDeleted)
        INCLUDE (Name, Stage, Origin, DeptPgClient, AssignedAnalyst, PriorityScore, Submitted, UpdatedAt);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260704_029_CreateRequests')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260704_029_CreateRequests', SUSER_SNAME(), N'Slice 5 — Requests table.');
END;
GO
