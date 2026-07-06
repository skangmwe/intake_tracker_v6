-- =============================================
-- Author:      /dev-build-application (Slice 21 — SLA Status + time-in-stage)
-- Create Date: 2026-07-06
-- Description: Rollback for 20260706_048 — drops dbo.Requests.StageEnteredAt. Idempotent.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Requests', N'StageEnteredAt') IS NOT NULL
    ALTER TABLE dbo.Requests DROP COLUMN StageEnteredAt;
GO

DELETE FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_048_AlterRequests_AddStageEnteredAt';
GO
