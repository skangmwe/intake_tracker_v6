-- =============================================
-- Author:      /dev-build-application (Slice 21 — SLA Status + time-in-stage)
-- Create Date: 2026-07-06
-- Description: Adds dbo.Requests.StageEnteredAt — the UTC timestamp the record's CURRENT stage
--              began (BS §10.6 time-in-stage). Stamped on create (usp_CreateRequest) and on every
--              stage transition (usp_SetRequestStage) going forward; existing rows are backfilled
--              to Submitted (the best available proxy for when the current stage began). Nullable so
--              the backfill is idempotent and a never-transitioned legacy row reads as "unknown"
--              (the API surfaces no time-in-stage rather than a wrong zero). Idempotent per
--              database-migrations.md.
-- =============================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Requests', N'StageEnteredAt') IS NULL
    ALTER TABLE dbo.Requests ADD StageEnteredAt DATETIME2 NULL;
GO

-- Backfill existing rows to Submitted (only rows not yet stamped) — chunk-free: the table is small
-- in Phase 1 and the WHERE clause makes the migration idempotent (already-stamped rows are skipped).
UPDATE dbo.Requests
SET StageEnteredAt = Submitted
WHERE StageEnteredAt IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.MigrationHistory WHERE MigrationId = N'20260706_048_AlterRequests_AddStageEnteredAt')
BEGIN
    INSERT INTO dbo.MigrationHistory (MigrationId, AppliedBy, Description)
    VALUES (N'20260706_048_AlterRequests_AddStageEnteredAt', SUSER_SNAME(), N'Slice 21 — Requests.StageEnteredAt (time-in-stage).');
END;
GO
