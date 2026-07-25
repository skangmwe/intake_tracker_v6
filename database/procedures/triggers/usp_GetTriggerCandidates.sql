-- =============================================
-- Author:      /dev-build-application (Slice: task-overdue-trigger, Task 4.3; extended Slice 5, Task 5.2)
-- Create Date: 2026-07-25
-- Description: Coarse candidate records for one trigger, dispatched on the trigger's ObjectType.
--                • Request (Authored) — every OPEN request in the workspace (open = no closure outcome,
--                  §17.2) with its full field-value map; the evaluator fine-checks the authored condition
--                  in C# via the ConditionEngine.
--                • Task (built-in TaskOverdue) — every OPEN task whose Due Date has passed (@Today). The
--                  fixed condition IS this SQL pre-filter; there is nothing to fine-check in C#.
--                • Approval (built-in ApprovalOverdue) — every unresolved gate whose RespondByDate has
--                  passed (@Today). The fixed condition IS this pre-filter; the evaluator resolves the
--                  eligible approvers to notify from the frozen approver set.
--              Every branch returns the same shape so the keyless bind is stable: RecordId (the fan-out
--              target — always a Request id), WatermarkKey (the per-candidate dedup key — the record id
--              for a Request, the TaskId for a Task, the ApprovalRequestId for an Approval so records nag
--              independently), FieldValuesJson (Authored only; NULL otherwise), AssigneeUserId (Task only;
--              NULL otherwise), ApproverSetJson (Approval only — the frozen approver set; NULL otherwise).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetTriggerCandidates
    @TriggerId UNIQUEIDENTIFIER,
    @Today     DATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Trigger    UNIQUEIDENTIFIER = @TriggerId;
    DECLARE @TodayLocal DATE             = @Today;
    DECLARE @Ws         UNIQUEIDENTIFIER;
    DECLARE @ObjectType NVARCHAR(64);

    SELECT @Ws = WorkspaceId, @ObjectType = ObjectType
    FROM dbo.ScheduledTrigger
    WHERE TriggerId = @Trigger AND IsDeleted = 0;

    IF @Ws IS NULL
        RETURN;

    IF @ObjectType = N'Request'
        SELECT
            r.RecordId,
            WatermarkKey    = r.RecordId,
            FieldValuesJson = r.FieldValues,
            AssigneeUserId  = CAST(NULL AS UNIQUEIDENTIFIER),
            ApproverSetJson = CAST(NULL AS NVARCHAR(MAX))
        FROM dbo.Requests AS r
        WHERE r.WorkspaceId = @Ws
          AND r.IsDeleted = 0
          AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL;
    ELSE IF @ObjectType = N'Task'
        SELECT
            t.RecordId,
            WatermarkKey    = CAST(t.TaskId AS NVARCHAR(64)),
            FieldValuesJson = CAST(NULL AS NVARCHAR(MAX)),
            AssigneeUserId  = t.AssigneeUserId,
            ApproverSetJson = CAST(NULL AS NVARCHAR(MAX))
        FROM dbo.Tasks AS t
        WHERE t.WorkspaceId = @Ws
          AND t.IsDeleted = 0
          AND t.Status = N'Open'
          AND t.DueDate IS NOT NULL
          AND t.DueDate < @TodayLocal;
    ELSE IF @ObjectType = N'Approval'
        SELECT
            RecordId        = a.RequestRecordId,
            WatermarkKey    = CAST(a.ApprovalRequestId AS NVARCHAR(64)),
            FieldValuesJson = CAST(NULL AS NVARCHAR(MAX)),
            AssigneeUserId  = CAST(NULL AS UNIQUEIDENTIFIER),
            ApproverSetJson = a.FrozenApproverSet
        FROM dbo.ApprovalRequests AS a
        WHERE a.WorkspaceId = @Ws
          AND a.IsDeleted = 0
          AND a.State <> N'Resolved'
          AND a.RespondByDate IS NOT NULL
          AND a.RespondByDate < @TodayLocal;
END;
GO
