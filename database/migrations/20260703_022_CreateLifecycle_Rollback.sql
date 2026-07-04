-- =============================================
-- Author:      /dev-build-application (Slice 4 — Lifecycle & gates admin)
-- Create Date: 2026-07-03
-- Description: Rollback for 20260703_022_CreateLifecycle. Idempotent. Drops the
--              lifecycle-scoped children (gate slots / gates / stages) first if present
--              so the FK-referenced parent drops cleanly when rollbacks run out of order.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.GateApproverSlot', N'U') IS NOT NULL DROP TABLE dbo.GateApproverSlot;
IF OBJECT_ID(N'dbo.GateDefinition', N'U') IS NOT NULL DROP TABLE dbo.GateDefinition;
IF OBJECT_ID(N'dbo.StageDefinition', N'U') IS NOT NULL DROP TABLE dbo.StageDefinition;
IF OBJECT_ID(N'dbo.Lifecycle', N'U') IS NOT NULL DROP TABLE dbo.Lifecycle;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260703_022_CreateLifecycle';
GO
