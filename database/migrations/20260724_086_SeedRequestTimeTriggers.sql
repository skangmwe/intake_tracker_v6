-- =============================================
-- Author:      /dev-build-application (Slice: triggers-request-authoring, Task 2.2)
-- Create Date: 2026-07-24
-- Description: Seed the two Request time-based triggers in the AI Solutions workspace, both DISABLED
--              (opt-in — design spec Open Q4; no surprise notifications on first deploy). Fixed GUIDs make
--              the seed idempotent. §17.2 SLA-breach and §17.11 Benefit-review, expressed as Authored
--              triggers evaluated by the engine (Slice 1).
--                1. SLA breach — Due Date has passed and the request is still open; notify the assigned
--                   analyst, repeating daily until it clears (sla-reminder).
--                2. Benefit review — the Benefit-review date has arrived; notify Business Owner + Watchers
--                   once (benefit-review).
-- =============================================
DECLARE @Ws         UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001';
DECLARE @SlaTrigger UNIQUEIDENTIFIER = N'F1A00000-0000-4000-8000-000000000001';
DECLARE @BenTrigger UNIQUEIDENTIFIER = N'F1A00000-0000-4000-8000-000000000002';

-- 1. SLA-breach reminder (disabled).
IF NOT EXISTS (SELECT 1 FROM dbo.ScheduledTrigger WHERE TriggerId = @SlaTrigger)
BEGIN
    INSERT INTO dbo.ScheduledTrigger
        (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence, RepeatIntervalDays, WindowDays,
         NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy)
    VALUES
        (@SlaTrigger, @Ws, N'Request', N'Authored', N'SLA breach reminder', 0, N'RepeatEveryNDays', 1, NULL,
         N'sla-reminder', N'["assignedAnalyst"]', N'A request is overdue',
         N'This request has passed its due date and is still open.', N'system', N'system');

    INSERT INTO dbo.ScheduledTriggerCondition
        (ConditionId, TriggerId, WhenFieldKey, Comparator, CompareValue, SortOrder, CreatedBy, UpdatedBy)
    VALUES
        (N'F1C00000-0000-4000-8000-000000000001', @SlaTrigger, N'dueDate', N'lt', N'@today', 0, N'system', N'system');
END;
GO

-- 2. Benefit-review prompt (disabled).
DECLARE @Ws2        UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001';
DECLARE @BenTrigger UNIQUEIDENTIFIER = N'F1A00000-0000-4000-8000-000000000002';
IF NOT EXISTS (SELECT 1 FROM dbo.ScheduledTrigger WHERE TriggerId = @BenTrigger)
BEGIN
    INSERT INTO dbo.ScheduledTrigger
        (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence, RepeatIntervalDays, WindowDays,
         NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy)
    VALUES
        (@BenTrigger, @Ws2, N'Request', N'Authored', N'Benefit review prompt', 0, N'Once', NULL, NULL,
         N'benefit-review', N'["businessOwner","watchers"]', N'A benefit review is due',
         N'The benefit-review date for this request has arrived.', N'system', N'system');

    INSERT INTO dbo.ScheduledTriggerCondition
        (ConditionId, TriggerId, WhenFieldKey, Comparator, CompareValue, SortOrder, CreatedBy, UpdatedBy)
    VALUES
        (N'F1C00000-0000-4000-8000-000000000002', @BenTrigger, N'benefitReviewDate', N'eq', N'@today', 0, N'system', N'system');
END;
GO
