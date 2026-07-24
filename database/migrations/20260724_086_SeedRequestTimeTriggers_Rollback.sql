-- =============================================
-- Author:      /dev-build-application (Slice: triggers-request-authoring, Task 2.2)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_086_SeedRequestTimeTriggers.sql — remove the two seeded triggers and
--              their conditions by fixed id.
-- =============================================
DELETE FROM dbo.ScheduledTriggerCondition
WHERE TriggerId IN (N'F1A00000-0000-4000-8000-000000000001', N'F1A00000-0000-4000-8000-000000000002');
GO

DELETE FROM dbo.ScheduledTrigger
WHERE TriggerId IN (N'F1A00000-0000-4000-8000-000000000001', N'F1A00000-0000-4000-8000-000000000002');
GO
