-- =============================================
-- Author:      /dev-build-application (Time-based triggers — Slice 5, Approval-overdue trigger)
-- Create Date: 2026-07-25
-- Description: Seed the built-in Approval-overdue trigger in the AI Solutions workspace, DISABLED (opt-in —
--              no surprise notifications on first deploy). A fixed GUID makes the seed idempotent. This is
--              a Kind = 'ApprovalOverdue' trigger: it carries NO authored conditions (the candidate
--              pre-filter — an unresolved gate whose RespondByDate has passed — is the whole "when") and
--              its recipients are resolved at fire time from each gate's frozen eligible approver set, so
--              Recipients is an empty array. Repeats daily until the gate resolves (approval-overdue).
-- =============================================
DECLARE @Ws               UNIQUEIDENTIFIER = N'1A150000-0000-4000-8000-000000000001';
DECLARE @ApprOvrTrigger   UNIQUEIDENTIFIER = N'F1A00000-0000-4000-8000-000000000004';

IF NOT EXISTS (SELECT 1 FROM dbo.ScheduledTrigger WHERE TriggerId = @ApprOvrTrigger)
BEGIN
    INSERT INTO dbo.ScheduledTrigger
        (TriggerId, WorkspaceId, ObjectType, Kind, Name, IsEnabled, Cadence, RepeatIntervalDays, WindowDays,
         NotificationCategory, Recipients, NotificationTitle, NotificationBody, CreatedBy, UpdatedBy)
    VALUES
        (@ApprOvrTrigger, @Ws, N'Approval', N'ApprovalOverdue', N'Overdue approval reminder', 0, N'RepeatEveryNDays', 1, NULL,
         N'approval-overdue', N'[]', N'An approval is overdue',
         N'This approval has passed its respond-by date and is still open.', N'system', N'system');
END;
GO
