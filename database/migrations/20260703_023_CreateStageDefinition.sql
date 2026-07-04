-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Creates dbo.StageDefinition — one ordered stage on a lifecycle's track
--              (S31, BS §7.1). Lifecycle-scoped; WorkspaceId denormalized for the
--              workspace-scoped read. StatusCategory maps a stage to a dashboard/rollup
--              bucket (§10.6). StageKey is a stable machine key, unique per lifecycle
--              (Slice 5's Stage-field options source from these rows). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.StageDefinition', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.StageDefinition
    (
        StageDefinitionId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_StageDefinition_StageDefinitionId DEFAULT NEWSEQUENTIALID(),
        LifecycleId       UNIQUEIDENTIFIER NOT NULL,
        WorkspaceId       UNIQUEIDENTIFIER NOT NULL,
        StageKey          NVARCHAR(64)     NOT NULL,
        Label             NVARCHAR(120)    NOT NULL,
        -- 'Intake' | 'Build' | 'Review' | 'Deploy' — dashboard/rollup bucket (§10.6).
        StatusCategory    NVARCHAR(16)     NOT NULL,
        SortOrder         INT              NOT NULL CONSTRAINT DF_StageDefinition_SortOrder DEFAULT 0,

        CreatedAt         DATETIME2        NOT NULL CONSTRAINT DF_StageDefinition_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt         DATETIME2        NOT NULL CONSTRAINT DF_StageDefinition_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy         NVARCHAR(256)    NOT NULL,
        UpdatedBy         NVARCHAR(256)    NOT NULL,
        IsDeleted         BIT              NOT NULL CONSTRAINT DF_StageDefinition_IsDeleted DEFAULT 0,
        DeletedAt         DATETIME2        NULL,

        CONSTRAINT PK_StageDefinition PRIMARY KEY CLUSTERED (StageDefinitionId),
        CONSTRAINT FK_StageDefinition_Lifecycle FOREIGN KEY (LifecycleId)
            REFERENCES dbo.Lifecycle (LifecycleId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_StageDefinition_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_StageDefinition_StatusCategory CHECK (StatusCategory IN (N'Intake', N'Build', N'Review', N'Deploy'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StageDefinition_LifecycleId' AND object_id = OBJECT_ID(N'dbo.StageDefinition'))
    CREATE NONCLUSTERED INDEX IX_StageDefinition_LifecycleId
        ON dbo.StageDefinition (LifecycleId, SortOrder)
        INCLUDE (StageKey, Label, StatusCategory) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StageDefinition_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.StageDefinition'))
    CREATE NONCLUSTERED INDEX IX_StageDefinition_WorkspaceId ON dbo.StageDefinition (WorkspaceId);
GO

-- One active stage key per lifecycle.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_StageDefinition_Lifecycle_Key' AND object_id = OBJECT_ID(N'dbo.StageDefinition'))
    CREATE UNIQUE INDEX UX_StageDefinition_Lifecycle_Key
        ON dbo.StageDefinition (LifecycleId, StageKey) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_023_CreateStageDefinition')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_023_CreateStageDefinition', SUSER_SNAME(), N'Slice 4 — StageDefinition table.');
END;
GO
