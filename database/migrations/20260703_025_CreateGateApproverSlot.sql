-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Creates dbo.GateApproverSlot — a team-only approver slot on a gate
--              (S31, BS §7.2; prototype changelog "gate approver slots identify only the
--              team/role label"). RoleLabel references dbo.RoleLabelCatalog by value; the
--              eligible members are resolved live from dbo.ApproverTeamMembership and are
--              frozen onto the ApprovalRequest at gate-open (slice 8). Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.GateApproverSlot', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GateApproverSlot
    (
        GateApproverSlotId UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_GateApproverSlot_GateApproverSlotId DEFAULT NEWSEQUENTIALID(),
        GateDefinitionId   UNIQUEIDENTIFIER NOT NULL,
        RoleLabel          NVARCHAR(120)    NOT NULL,
        SlotIndex          INT              NOT NULL CONSTRAINT DF_GateApproverSlot_SlotIndex DEFAULT 0,

        CreatedAt          DATETIME2        NOT NULL CONSTRAINT DF_GateApproverSlot_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt          DATETIME2        NOT NULL CONSTRAINT DF_GateApproverSlot_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy          NVARCHAR(256)    NOT NULL,
        UpdatedBy          NVARCHAR(256)    NOT NULL,
        IsDeleted          BIT              NOT NULL CONSTRAINT DF_GateApproverSlot_IsDeleted DEFAULT 0,
        DeletedAt          DATETIME2        NULL,

        CONSTRAINT PK_GateApproverSlot PRIMARY KEY CLUSTERED (GateApproverSlotId),
        CONSTRAINT FK_GateApproverSlot_GateDefinition FOREIGN KEY (GateDefinitionId)
            REFERENCES dbo.GateDefinition (GateDefinitionId) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_GateApproverSlot_GateDefinitionId' AND object_id = OBJECT_ID(N'dbo.GateApproverSlot'))
    CREATE NONCLUSTERED INDEX IX_GateApproverSlot_GateDefinitionId
        ON dbo.GateApproverSlot (GateDefinitionId, SlotIndex)
        INCLUDE (RoleLabel) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_025_CreateGateApproverSlot')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260703_025_CreateGateApproverSlot', SUSER_SNAME(), N'Slice 4 — GateApproverSlot table.');
END;
GO
