-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: Extend CK_Notifications_Category to admit the four time-based-trigger categories
--              (design spec §3.5) so usp_FanOutNotification can materialise trigger.fired bell rows:
--                sla-reminder · benefit-review · task-overdue · approval-overdue.
--              Drop-and-recreate so the migration is idempotent and the value set is explicit.
-- =============================================
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Category' AND parent_object_id = OBJECT_ID(N'dbo.Notifications'))
    ALTER TABLE dbo.Notifications DROP CONSTRAINT CK_Notifications_Category;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Category' AND parent_object_id = OBJECT_ID(N'dbo.Notifications'))
    ALTER TABLE dbo.Notifications WITH CHECK ADD CONSTRAINT CK_Notifications_Category CHECK (Category IN (
        N'sign-off-requested', N'gate-decided', N'assigned-to-you', N'escalation-received',
        N'hold-changed', N'mentioned', N'announcement-posted', N'closed',
        N'sla-reminder', N'benefit-review', N'task-overdue', N'approval-overdue'));
GO
