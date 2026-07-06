-- =============================================
-- Author:      /dev-build-application (Slice 22 — Home surface)
-- Create Date: 2026-07-06
-- Description: Home "Needs your decision" panel (BS §10.7). Returns the open gates in @WorkspaceId
--              where the caller is an eligible approver on a slot that no one has signed yet —
--              exactly the gates the caller must act on. Access: the caller's WorkspaceMembership is
--              verified API-side before this runs; the panel only surfaces gates the caller is a
--              frozen-slot member of, so it never discloses a record the caller could not otherwise
--              reach. Frozen slot shape (usp_OpenGate):
--                [{ slotIndex, roleLabel, displayLabel, eligibleMembers:[{ userId, displayName }] }]
--              A slot is "still needs you" when it has no live (non-superseded) Approved decision.
--              One row per gate (the caller's first eligible unsatisfied slot); oldest-waiting first.
--              TotalCount rides as a windowed column so the panel count is the full match, not the
--              capped page. Params copied to locals (parameter-sniffing mitigation).
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetHomeDecisions
    @UserId      UNIQUEIDENTIFIER,
    @WorkspaceId UNIQUEIDENTIFIER,
    @Top         INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @User UNIQUEIDENTIFIER = @UserId;
    DECLARE @Ws   UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @TopL INT = CASE WHEN @Top < 1 THEN 20 WHEN @Top > 100 THEN 100 ELSE @Top END;

    ;WITH EligibleSlots AS (
        SELECT
            ar.ApprovalRequestId,
            ar.RequestRecordId,
            ar.FromStageLabel,
            ar.ToStageLabel,
            ar.OpenedAt,
            slot.roleLabel,
            slot.slotIndex,
            ROW_NUMBER() OVER (PARTITION BY ar.ApprovalRequestId ORDER BY slot.slotIndex) AS SlotRank
        FROM dbo.ApprovalRequests AS ar
        CROSS APPLY OPENJSON(ar.FrozenApproverSet)
            WITH (
                slotIndex       INT           N'$.slotIndex',
                roleLabel       NVARCHAR(120) N'$.roleLabel',
                eligibleMembers NVARCHAR(MAX) N'$.eligibleMembers' AS JSON
            ) AS slot
        WHERE ar.WorkspaceId = @Ws
          AND ar.IsDeleted = 0
          AND ar.State IN (N'Pending', N'ChangesRequested')
          AND EXISTS (
                SELECT 1
                FROM OPENJSON(slot.eligibleMembers) WITH (userId UNIQUEIDENTIFIER N'$.userId') AS em
                WHERE em.userId = @User)
          AND NOT EXISTS (
                SELECT 1
                FROM dbo.ApprovalDecisions AS d
                WHERE d.ApprovalRequestId = ar.ApprovalRequestId
                  AND d.SlotIndex = slot.slotIndex
                  AND d.Decision = N'Approved'
                  AND d.SupersededAt IS NULL
                  AND d.IsDeleted = 0)
    )
    SELECT
        es.RequestRecordId                          AS RecordId,
        r.Name                                       AS Name,
        es.FromStageLabel + N' → ' + es.ToStageLabel AS GateLabel,
        es.roleLabel                                 AS RoleLabel,
        es.OpenedAt                                  AS OpenedAt,
        COUNT(*) OVER ()                             AS TotalCount
    FROM EligibleSlots AS es
    INNER JOIN dbo.Requests AS r
        ON r.WorkspaceId = @Ws AND r.RecordId = es.RequestRecordId AND r.IsDeleted = 0
    WHERE es.SlotRank = 1
    ORDER BY es.OpenedAt ASC, es.RequestRecordId ASC
    OFFSET 0 ROWS FETCH NEXT @TopL ROWS ONLY;
END;
GO
