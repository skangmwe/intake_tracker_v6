-- =============================================
-- Author:      /dev-build-application (Slice: triggers-engine-core, Task 1.1)
-- Create Date: 2026-07-24
-- Description: Rollback for 20260724_085_AlterNotifications_AddTriggerCategories.sql — restore the
--              original CK_Notifications_Category value set (migration 041). Any trigger-category rows
--              must be removed before applying, or the recreated CHECK will fail validation.
-- =============================================
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Category' AND parent_object_id = OBJECT_ID(N'dbo.Notifications'))
    ALTER TABLE dbo.Notifications DROP CONSTRAINT CK_Notifications_Category;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Category' AND parent_object_id = OBJECT_ID(N'dbo.Notifications'))
    ALTER TABLE dbo.Notifications WITH CHECK ADD CONSTRAINT CK_Notifications_Category CHECK (Category IN (
        N'sign-off-requested', N'gate-decided', N'assigned-to-you', N'escalation-received',
        N'hold-changed', N'mentioned', N'announcement-posted', N'closed'));
GO
