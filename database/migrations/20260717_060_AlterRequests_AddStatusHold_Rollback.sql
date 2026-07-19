-- =============================================
-- Author:      /dev-build-application (Slice 26 — Record Status/hold model)
-- Create Date: 2026-07-17
-- Description: Rollback for 20260717_060_AlterRequests_AddStatusHold. Drops the
--              filtered index, CHECK constraint, and both columns from dbo.Requests,
--              and removes the migration history row. Idempotent.
--
--              Rolling back 060 while 061 (backfill) has already run is safe — the
--              column drop discards the backfilled values; the untouched JSON keys
--              (`$.holdBlocked`, `$.holdReason`) still carry the pre-Slice-26 hold state.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Requests_Workspace_StatusHold' AND object_id = OBJECT_ID(N'dbo.Requests'))
    DROP INDEX IX_Requests_Workspace_StatusHold ON dbo.Requests;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.Requests') AND name = N'CK_Requests_StatusHold')
    ALTER TABLE dbo.Requests DROP CONSTRAINT CK_Requests_StatusHold;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.Requests') AND name = N'DF_Requests_StatusHold')
    ALTER TABLE dbo.Requests DROP CONSTRAINT DF_Requests_StatusHold;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Requests') AND name = N'StatusHoldNote')
    ALTER TABLE dbo.Requests DROP COLUMN StatusHoldNote;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Requests') AND name = N'StatusHold')
    ALTER TABLE dbo.Requests DROP COLUMN StatusHold;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260717_060_AlterRequests_AddStatusHold';
GO
