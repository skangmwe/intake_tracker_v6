-- =============================================
-- Author:      /dev-build-application (Time-based triggers — Slice 5, Approval-overdue trigger)
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_093_SeedApprovalOverdueTrigger.sql — remove the seeded
--              Approval-overdue trigger by fixed id. Idempotent.
-- =============================================
DELETE FROM dbo.ScheduledTrigger
WHERE TriggerId = N'F1A00000-0000-4000-8000-000000000004';
GO
