-- =============================================
-- Author:      /dev-build-application (Slice 8 — Gates on records + Approvals)
-- Create Date: 2026-07-04
-- Description: The single projection every gate read/write proc returns — one row per ApprovalRequest
--              plus its decisions rolled up as a JSON array (DecisionsJson). Keeps the wire shape DRY
--              across usp_OpenGate / usp_GetApprovalRequestsForRecord / usp_SubmitDecision /
--              usp_ReRequestApproval so the API maps a single keyless projection. FrozenApproverSet is
--              the snapshot taken at gate-open; DecisionsJson interleaves live and superseded decisions
--              (superseded rejections are retained as history, per data-model.md §ApprovalDecision).
--              Filters soft-deleted requests; callers add their own access gate (membership join).
-- =============================================
CREATE OR ALTER VIEW dbo.vw_ApprovalRequestDetail
AS
SELECT
    ar.ApprovalRequestId,
    ar.RequestRecordId,
    ar.WorkspaceId,
    ar.GateDefinitionId,
    ar.GateName,
    ar.FromStageKey,
    ar.ToStageKey,
    ar.FromStageLabel,
    ar.ToStageLabel,
    ar.State,
    ar.OpenedAt,
    ar.ResolvedAt,
    ar.RespondByDate,
    ar.FrozenApproverSet,
    ISNULL((
        SELECT
            d.SlotIndex        AS slotIndex,
            d.Decision         AS decision,
            d.DecidedByUserId  AS decidedByUserId,
            u.DisplayName      AS decidedByName,
            d.DecidedAt        AS decidedAt,
            d.Comment          AS comment,
            d.IsProxy          AS isProxy,
            CASE WHEN d.SupersededAt IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END AS superseded
        FROM dbo.ApprovalDecisions AS d
        INNER JOIN dbo.Users AS u ON u.UserId = d.DecidedByUserId
        WHERE d.ApprovalRequestId = ar.ApprovalRequestId AND d.IsDeleted = 0
        ORDER BY d.SlotIndex, d.DecidedAt
        FOR JSON PATH
    ), N'[]') AS DecisionsJson
FROM dbo.ApprovalRequests AS ar
WHERE ar.IsDeleted = 0;
GO
