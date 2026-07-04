-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Creates dbo.GateDefinition — an approval gate on a lifecycle transition
--              (S31, BS §7.2). The gate fires on entry to ToStage from FromStage. JoinKind
--              is AND-only (every slot must approve). Lifecycle-scoped; WorkspaceId
--              denormalized. From/To reference StageDefinition rows in the same lifecycle
--              (validated by the save proc). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.GateDefinition', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GateDefinition
    (
        GateDefinitionId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_GateDefinition_GateDefinitionId DEFAULT NEWSEQUENTIALID(),
        LifecycleId      UNIQUEIDENTIFIER NOT NULL,
        WorkspaceId      UNIQUEIDENTIFIER NOT NULL,
        Name             NVARCHAR(200)    NOT NULL,
        FromStageId      UNIQUEIDENTIFIER NOT NULL,
        ToStageId        UNIQUEIDENTIFIER NOT NULL,
        -- AND-join is the only kind (every slot must approve).
        JoinKind         NVARCHAR(8)      NOT NULL CONSTRAINT DF_GateDefinition_JoinKind DEFAULT N'and',
        SortOrder        INT              NOT NULL CONSTRAINT DF_GateDefinition_SortOrder DEFAULT 0,

        CreatedAt        DATETIME2        NOT NULL CONSTRAINT DF_GateDefinition_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt        DATETIME2        NOT NULL CONSTRAINT DF_GateDefinition_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy        NVARCHAR(256)    NOT NULL,
        UpdatedBy        NVARCHAR(256)    NOT NULL,
        IsDeleted        BIT              NOT NULL CONSTRAINT DF_GateDefinition_IsDeleted DEFAULT 0,
        DeletedAt        DATETIME2        NULL,

        CONSTRAINT PK_GateDefinition PRIMARY KEY CLUSTERED (GateDefinitionId),
        CONSTRAINT FK_GateDefinition_Lifecycle FOREIGN KEY (LifecycleId)
            REFERENCES dbo.Lifecycle (LifecycleId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_GateDefinition_Workspaces FOREIGN KEY (WorkspaceId)
            REFERENCES dbo.Workspaces (WorkspaceId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_GateDefinition_FromStage FOREIGN KEY (FromStageId)
            REFERENCES dbo.StageDefinition (StageDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_GateDefinition_ToStage FOREIGN KEY (ToStageId)
            REFERENCES dbo.StageDefinition (StageDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_GateDefinition_JoinKind CHECK (JoinKind IN (N'and'))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GateDefinition_LifecycleId' AND object_id = OBJECT_ID(N'dbo.GateDefinition'))
    CREATE NONCLUSTERED INDEX IX_GateDefinition_LifecycleId
        ON dbo.GateDefinition (LifecycleId, SortOrder)
        INCLUDE (Name, FromStageId, ToStageId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GateDefinition_WorkspaceId' AND object_id = OBJECT_ID(N'dbo.GateDefinition'))
    CREATE NONCLUSTERED INDEX IX_GateDefinition_WorkspaceId ON dbo.GateDefinition (WorkspaceId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GateDefinition_FromStageId' AND object_id = OBJECT_ID(N'dbo.GateDefinition'))
    CREATE NONCLUSTERED INDEX IX_GateDefinition_FromStageId ON dbo.GateDefinition (FromStageId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GateDefinition_ToStageId' AND object_id = OBJECT_ID(N'dbo.GateDefinition'))
    CREATE NONCLUSTERED INDEX IX_GateDefinition_ToStageId ON dbo.GateDefinition (ToStageId);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_024_CreateGateDefinition')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_024_CreateGateDefinition', SUSER_SNAME(), N'Slice 4 — GateDefinition table.');
END;
GO
