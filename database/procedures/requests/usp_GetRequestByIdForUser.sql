-- =============================================
-- Author:      /dev-build-application (Slice 5 — Requests core)
-- Create Date: 2026-07-04
-- Description: Returns the single Request row for @RecordId that @UserId is entitled to see —
--              access is baked into the query via a JOIN to WorkspaceMembership (api-record-
--              access.md: list/detail read paths filter in the query, never fetch-all-then-hide).
--              A record the caller cannot see, or a non-existent id, both return ZERO rows, so
--              the API returns 403 uniformly and never discloses record existence (BS §22.6).
--
--              Escalated records (slice 9) have two rows sharing a RecordId; this returns the
--              row on whichever side the caller is a member of. In slice 5 there is one row.
--              RowVer is returned for the PATCH ETag.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetRequestByIdForUser
    @RecordId NVARCHAR(20),
    @UserId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RecordIdLocal NVARCHAR(20)     = @RecordId;
    DECLARE @UserIdLocal   UNIQUEIDENTIFIER = @UserId;

    SELECT
        r.RecordId,
        r.WorkspaceId,
        r.LifecycleId,
        r.Origin,
        r.Name,
        r.Description,
        r.Stage,
        r.Submitted,
        r.FieldValues,
        r.PriorityScore,
        -- Slice 21: DueDate + StageEnteredAt drive detail-side SLA Status (§17.2) and time-in-stage
        -- (§10.6); DueSoonWindowDays is the workspace's due-soon window. All derived in the service.
        r.DueDate,
        r.StageEnteredAt,
        w.DueSoonWindowDays,
        r.CreatedAt,
        r.UpdatedAt,
        r.CreatedBy,
        r.UpdatedBy,
        r.RowVer
    FROM dbo.Requests AS r
    INNER JOIN dbo.WorkspaceMembership AS m
        ON m.WorkspaceId = r.WorkspaceId
       AND m.UserId = @UserIdLocal
       AND m.IsDeleted = 0
    INNER JOIN dbo.Workspaces AS w
        ON w.WorkspaceId = r.WorkspaceId
    WHERE r.RecordId = @RecordIdLocal
      AND r.IsDeleted = 0;
END;
GO
