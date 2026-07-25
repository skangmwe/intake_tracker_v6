-- =============================================
-- Author:      /dev-build-application (Slice: task-overdue-trigger, Task 4.3)
-- Create Date: 2026-07-25
-- Description: Rollback for 20260725_090_SeedTaskOverdueTrigger.sql — remove the seeded Task-overdue trigger
--              by fixed id. Idempotent.
-- =============================================
DELETE FROM dbo.ScheduledTrigger
WHERE TriggerId = N'F1A00000-0000-4000-8000-000000000003';
GO
