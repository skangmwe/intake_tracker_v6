-- =============================================
-- Author:      /dev-build-application (Slice 22 — Home surface)
-- Create Date: 2026-07-06
-- Description: Home "Your work today" panel (BS §10.7). Returns the open records the caller owns in
--              @WorkspaceId, urgency-ordered. Phase 1 has no assignee *user reference* (Analyst /
--              Requestor are free-text field values — module-boundaries §16), so ownership is the
--              record's CreatedBy — the only reliable user reference on a Request. CreatedBy stores the
--              caller's Entra oid as Guid.ToString() (usp_CreateRequest), which equals CAST(@User AS
--              NVARCHAR(36)). "Open" = not yet closed (no outcome in FieldValues). Urgency order:
--              overdue, then due-soon (within the workspace window), then dated, then undated; ties by
--              due date. The stage label resolves through the record's lifecycle StageDefinition. The
--              SLA state itself is derived API-side from DueDate + DueSoonWindowDays (single source:
--              RequestsService.ComputeSla), so both are returned. Access is verified API-side; this
--              proc is workspace-scoped (defence in depth). TotalCount rides as a windowed column.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_GetHomeWork
    @UserId      UNIQUEIDENTIFIER,
    @WorkspaceId UNIQUEIDENTIFIER,
    @Top         INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @User       UNIQUEIDENTIFIER = @UserId;
    DECLARE @Ws         UNIQUEIDENTIFIER = @WorkspaceId;
    DECLARE @UserStr    NVARCHAR(36)     = CAST(@UserId AS NVARCHAR(36));
    DECLARE @TopL       INT              = CASE WHEN @Top < 1 THEN 20 WHEN @Top > 100 THEN 100 ELSE @Top END;
    DECLARE @Today      DATE             = CAST(SYSUTCDATETIME() AS DATE);
    DECLARE @Window     INT = ISNULL((SELECT DueSoonWindowDays FROM dbo.Workspaces WHERE WorkspaceId = @Ws), 3);
    DECLARE @WindowSafe INT = CASE WHEN @Window < 0 THEN 0 ELSE @Window END;

    SELECT
        r.RecordId                                              AS RecordId,
        r.Name                                                  AS Name,
        ISNULL(sd.Label, ISNULL(r.Stage, N''))                  AS StageLabel,
        COALESCE(NULLIF(r.DeptPgClient, N''), NULLIF(r.Origin, N''), N'') AS Origin,
        r.DueDate                                               AS DueDate,
        @Window                                                 AS DueSoonWindowDays,
        COUNT(*) OVER ()                                        AS TotalCount
    FROM dbo.Requests AS r
    LEFT JOIN dbo.StageDefinition AS sd
        ON sd.LifecycleId = r.LifecycleId AND sd.StageKey = r.Stage AND sd.IsDeleted = 0
    WHERE r.WorkspaceId = @Ws
      AND r.IsDeleted = 0
      AND r.CreatedBy = @UserStr
      AND JSON_VALUE(r.FieldValues, N'$.outcome') IS NULL
    ORDER BY
        CASE
            WHEN r.DueDate IS NULL                                   THEN 3
            WHEN r.DueDate < @Today                                  THEN 0
            WHEN r.DueDate <= DATEADD(DAY, @WindowSafe, @Today)      THEN 1
            ELSE 2
        END ASC,
        r.DueDate ASC,
        r.RecordId ASC
    OFFSET 0 ROWS FETCH NEXT @TopL ROWS ONLY;
END;
GO
